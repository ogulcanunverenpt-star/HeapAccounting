#define _POSIX_C_SOURCE 200809L
#include "proxy.h"

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <unistd.h>

#define MAX_BODY (15U * 1024U * 1024U)

static int would_block(void)
{
    return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR;
}

static int append(struct api_proxy *p, const char *value, size_t length)
{
    if (length > sizeof p->up - p->up_len) return -1;
    memcpy(p->up + p->up_len, value, length);
    p->up_len += length;
    return 0;
}

int proxy_start(struct api_proxy *p, const char *request, size_t length,
                const char *method, const char *target, unsigned short port)
{
    const char *header_end = strstr(request, "\r\n\r\n");
    const char *line = strstr(request, "\r\n");
    size_t body_length, content_length = 0;
    int has_length = 0, has_auth = 0, has_type = 0;
    struct sockaddr_in address;
    char first[4200];
    int n, flags;

    p->fd = -1;
    if (!header_end || !line || line > header_end ||
        (strcmp(method, "GET") && strcmp(method, "POST"))) return 400;
    if (memchr(request, '\0', (size_t)(header_end - request)) != NULL) return 400;
    n = snprintf(first, sizeof first, "%s %s HTTP/1.1\r\nHost: 127.0.0.1:%u\r\nConnection: close\r\n",
                 method, target, (unsigned)port);
    if (n < 0 || (size_t)n >= sizeof first || append(p, first, (size_t)n) < 0) return 400;

    line += 2;
    while (line < header_end) {
        const char *end = strstr(line, "\r\n");
        const char *colon, *value, *value_end, *ch;
        size_t name_len;
        if (!end || end > header_end) return 400;
        colon = memchr(line, ':', (size_t)(end - line));
        if (!colon || colon == line) return 400;
        name_len = (size_t)(colon - line);
        for (ch = line; ch < colon; ch++)
            if (!isalnum((unsigned char)*ch) && *ch != '-') return 400;
        value = colon + 1;
        while (value < end && (*value == ' ' || *value == '\t')) value++;
        value_end = end;
        while (value_end > value && (value_end[-1] == ' ' || value_end[-1] == '\t')) value_end--;
        for (ch = value; ch < value_end; ch++)
            if ((unsigned char)*ch < 32 && *ch != '\t') return 400;
        if (name_len == 17 && !strncasecmp(line, "Transfer-Encoding", name_len)) return 400;
        if (name_len == 6 && !strncasecmp(line, "Expect", name_len)) return 417;
        if (name_len == 14 && !strncasecmp(line, "Content-Length", name_len)) {
            size_t parsed = 0;
            if (has_length++ || value == value_end) return 400;
            for (ch = value; ch < value_end; ch++) {
                if (*ch < '0' || *ch > '9') return 400;
                if (parsed > (MAX_BODY - (size_t)(*ch - '0')) / 10) return 413;
                parsed = parsed * 10 + (size_t)(*ch - '0');
            }
            content_length = parsed;
        } else if (name_len == 13 && !strncasecmp(line, "Authorization", name_len)) {
            if (has_auth++) return 400;
            if (append(p, line, (size_t)(end - line) + 2) < 0) return 400;
        } else if (name_len == 12 && !strncasecmp(line, "Content-Type", name_len)) {
            if (has_type++) return 400;
            if (append(p, line, (size_t)(end - line) + 2) < 0) return 400;
        }
        line = end + 2;
    }
    if (!strcmp(method, "POST") && !has_length) return 411;
    if (!strcmp(method, "GET") && content_length != 0) return 400;
    n = snprintf(first, sizeof first, "Content-Length: %zu\r\n\r\n", content_length);
    if (n < 0 || append(p, first, (size_t)n) < 0) return 400;
    body_length = length - (size_t)(header_end + 4 - request);
    if (body_length > content_length || append(p, header_end + 4, body_length) < 0) return 400;
    p->body_remaining = content_length - body_length;

    p->fd = socket(AF_INET, SOCK_STREAM, 0);
    if (p->fd < 0) return 502;
    flags = fcntl(p->fd, F_GETFL);
    if (flags < 0 || fcntl(p->fd, F_SETFL, flags | O_NONBLOCK) < 0) return 502;
    memset(&address, 0, sizeof address);
    address.sin_family = AF_INET;
    address.sin_port = htons(port);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (connect(p->fd, (struct sockaddr *)&address, sizeof address) < 0) {
        if (errno != EINPROGRESS) return 502;
        p->connecting = 1;
    }
    return 0;
}

short proxy_client_events(const struct api_proxy *p)
{
    short events = 0;
    if (!p->response_started && p->body_remaining && p->up_pos == p->up_len) events |= POLLIN;
    if (p->down_pos < p->down_len) events |= POLLOUT;
    return events;
}

short proxy_upstream_events(const struct api_proxy *p)
{
    short events = 0;
    if (p->connecting || (!p->response_started && p->up_pos < p->up_len)) events |= POLLOUT;
    if (!p->connecting && !p->upstream_eof && p->down_pos == p->down_len) events |= POLLIN;
    return events;
}

/* Returns 0 while active, -1 when finished, or 502 before any response. */
int proxy_step(struct api_proxy *p, int client, short client_events)
{
    ssize_t n;
    if (client_events & (POLLERR | POLLNVAL | POLLHUP)) return -1;
    if (p->connecting && (p->revents & (POLLOUT | POLLERR | POLLHUP))) {
        int error = 0;
        socklen_t len = sizeof error;
        if (getsockopt(p->fd, SOL_SOCKET, SO_ERROR, &error, &len) < 0 || error) return 502;
        p->connecting = 0;
    }
    if (p->revents & POLLNVAL) return p->response_started ? -1 : 502;
    if (!p->connecting && (p->revents & POLLOUT) && p->up_pos < p->up_len && !p->response_started) {
        n = send(p->fd, p->up + p->up_pos, p->up_len - p->up_pos, 0);
        if (n < 0 && !would_block()) return p->response_started ? -1 : 502;
        if (n > 0) p->up_pos += (size_t)n;
    }
    if ((client_events & POLLIN) && p->body_remaining && p->up_pos == p->up_len && !p->response_started) {
        size_t amount = p->body_remaining < sizeof p->up ? p->body_remaining : sizeof p->up;
        n = recv(client, p->up, amount, 0);
        if (n == 0 || (n < 0 && !would_block())) return -1;
        if (n > 0) { p->up_pos = 0; p->up_len = (size_t)n; p->body_remaining -= (size_t)n; }
    }
    if (!p->connecting && (p->revents & (POLLIN | POLLHUP | POLLERR)) &&
        p->down_pos == p->down_len && !p->upstream_eof) {
        n = recv(p->fd, p->down, sizeof p->down, 0);
        if (n < 0 && !would_block()) return p->response_started ? -1 : 502;
        if (n == 0) {
            if (!p->response_started) return 502;
            p->upstream_eof = 1;
        } else if (n > 0) {
            p->response_started = 1;
            p->down_pos = 0;
            p->down_len = (size_t)n;
        }
    }
    if ((client_events & POLLOUT) && p->down_pos < p->down_len) {
        n = send(client, p->down + p->down_pos, p->down_len - p->down_pos, 0);
        if (n == 0 || (n < 0 && !would_block())) return -1;
        if (n > 0) p->down_pos += (size_t)n;
    }
    if (p->upstream_eof && p->down_pos == p->down_len) return -1;
    return 0;
}
