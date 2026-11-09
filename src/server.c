#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include "mime.h"
#include "net.h"
#include "proxy.h"

#define PORT "3490"
#define MAX_CLIENTS 8192
#define REQUEST_SIZE 8192
#define OUTPUT_SIZE 16384
#define IDLE_SECONDS 30

struct client {
    int file;
    time_t last_active;
    size_t request_len;
    size_t output_len;
    size_t output_pos;
    off_t remaining;
    off_t file_offset;
    int writing;
    int local_peer;
    struct api_proxy *proxy;
    char request[REQUEST_SIZE + 1];
    char output[OUTPUT_SIZE];
};

static volatile sig_atomic_t stopping;
static unsigned short api_port = 3491;

static int is_loopback(const struct sockaddr_storage *address)
{
    if (address->ss_family == AF_INET) {
        const struct sockaddr_in *v4 = (const struct sockaddr_in *)address;
        return (ntohl(v4->sin_addr.s_addr) >> 24) == 127;
    }
    if (address->ss_family == AF_INET6) {
        const struct sockaddr_in6 *v6 = (const struct sockaddr_in6 *)address;
        const unsigned char *bytes = v6->sin6_addr.s6_addr;
        return IN6_IS_ADDR_LOOPBACK(&v6->sin6_addr) ||
               (IN6_IS_ADDR_V4MAPPED(&v6->sin6_addr) && bytes[12] == 127);
    }
    return 0;
}

static void stop_server(int sig)
{
    (void)sig;
    stopping = 1;
}

static time_t monotonic_seconds(void)
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) == -1) {
        perror("clock_gettime");
        exit(EXIT_FAILURE);
    }
    return ts.tv_sec;
}

static int nonblocking(int fd)
{
    int flags = fcntl(fd, F_GETFL);
    return flags == -1 ? -1 : fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static void close_client(struct pollfd *p, struct client *c)
{
    if (c->proxy) {
        if (c->proxy->fd >= 0) close(c->proxy->fd);
        free(c->proxy);
    }
    if (c->file >= 0)
        close(c->file);
    close(p->fd);
    free(c);
}

static int response(struct client *c, int status, const char *reason,
                    const char *type, off_t length)
{
    int n = snprintf(c->output, sizeof c->output,
                     "HTTP/1.1 %d %s\r\nContent-Type: %s\r\n"
                     "Content-Length: %lld\r\n%sConnection: close\r\n\r\n",
                     status, reason, type, (long long)length,
                     status == 405 ? "Allow: GET\r\n" : "");
    if (n < 0 || (size_t)n >= sizeof c->output)
        return -1;
    c->output_len = (size_t)n;
    c->output_pos = 0;
    c->remaining = length;
    c->writing = 1;
    return 0;
}

static int text_response(struct client *c, int status, const char *reason,
                         const char *body)
{
    size_t len = strlen(body);
    if (response(c, status, reason, "text/plain; charset=utf-8", (off_t)len) < 0 ||
        c->output_len + len > sizeof c->output)
        return -1;
    memcpy(c->output + c->output_len, body, len);
    c->output_len += len;
    c->remaining = 0;
    return 0;
}

static int hex_value(unsigned char ch)
{
    if (ch >= '0' && ch <= '9') return ch - '0';
    if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
    if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
    return -1;
}

/* Resolve each component without following symlinks, including intermediates. */
static int open_request_file(int root, char *path)
{
    int dir = dup(root);
    char *part, *save = NULL;
    if (dir < 0)
        return -1;
    part = strtok_r(path, "/", &save);
    while (part != NULL) {
        char *next = strtok_r(NULL, "/", &save);
        int fd;
        if (!strcmp(part, ".") || !strcmp(part, "..")) {
            close(dir);
            errno = EACCES;
            return -1;
        }
        fd = openat(dir, part, O_RDONLY | O_NOFOLLOW | O_NONBLOCK |
                    (next != NULL ? O_DIRECTORY : 0));
        close(dir);
        if (fd < 0)
            return -1;
        dir = fd;
        part = next;
    }
    return dir;
}

static int prepare_file(struct client *c, int root, char *path, char *filename)
{
    struct stat st;
    int fd = open_request_file(root, path);
    if (fd < 0)
        return -1;
    if (fstat(fd, &st) < 0) {
        close(fd);
        return -1;
    }
    if (!S_ISREG(st.st_mode) || st.st_size < 0) {
        close(fd);
        errno = ENOENT;
        return -1;
    }
    c->file = fd;
    if (response(c, 200, "OK", mime_type_get(filename), st.st_size) < 0) {
        close(fd);
        c->file = -1;
        errno = EOVERFLOW;
        return -1;
    }
    return 0;
}

static int not_found(struct client *c, int error_file)
{
    struct stat st;
    int fd = dup(error_file);
    if (fd < 0 || fstat(fd, &st) < 0) {
        perror("404 file");
        if (fd >= 0) close(fd);
        return text_response(c, 500, "Internal Server Error", "Internal Server Error\n");
    }
    if (!S_ISREG(st.st_mode)) {
        fprintf(stderr, "404 file is not a regular file\n");
        close(fd);
        return text_response(c, 500, "Internal Server Error", "Internal Server Error\n");
    }
    /* dup shares an offset, so use pread when sending file contents. */
    c->file = fd;
    if (response(c, 404, "Not Found", "text/html", st.st_size) < 0) {
        close(fd);
        c->file = -1;
        return -1;
    }
    return 0;
}

static int handle_request(struct client *c, int root, int error_file)
{
    char method[16], target[4096], version[16], extra;
    char path[4096];
    size_t i, j;
    char *end = strchr(c->request, '\n');
    if (end == NULL)
        return text_response(c, 400, "Bad Request", "Bad Request\n");
    *end = '\0';
    if (sscanf(c->request, "%15s %4095s %15s %c", method, target, version, &extra) != 3 ||
        (strcmp(version, "HTTP/1.1") && strcmp(version, "HTTP/1.0")) ||
        target[0] != '/')
        return text_response(c, 400, "Bad Request", "Bad Request\n");
    *end = '\n';
    if (!strncmp(target, "/api/", 5)) {
        int status;
        if (!c->local_peer) return text_response(c, 403, "Forbidden", "API proxy is restricted to loopback clients\n");
        if (strcmp(method, "GET") && strcmp(method, "POST"))
            return text_response(c, 405, "Method Not Allowed", "Method Not Allowed\n");
        c->proxy = calloc(1, sizeof *c->proxy);
        if (!c->proxy) return text_response(c, 500, "Internal Server Error", "Internal Server Error\n");
        status = proxy_start(c->proxy, c->request, c->request_len, method, target, api_port);
        if (status) {
            if (c->proxy->fd >= 0) close(c->proxy->fd);
            free(c->proxy);
            c->proxy = NULL;
            if (status == 413) return text_response(c, 413, "Payload Too Large", "Payload Too Large\n");
            if (status == 411) return text_response(c, 411, "Length Required", "Length Required\n");
            if (status == 417) return text_response(c, 417, "Expectation Failed", "Expectation Failed\n");
            if (status == 502) return text_response(c, 502, "Bad Gateway", "Exam service unavailable\n");
            return text_response(c, 400, "Bad Request", "Bad Request\n");
        }
        return 0;
    }
    if (strcmp(method, "GET"))
        return text_response(c, 405, "Method Not Allowed", "Method Not Allowed\n");

    for (i = 1, j = 0; target[i] && target[i] != '?'; i++) {
        unsigned char ch = (unsigned char)target[i];
        if (ch == '%') {
            int hi, lo;
            if (!target[i + 1] || !target[i + 2] ||
                (hi = hex_value((unsigned char)target[i + 1])) < 0 ||
                (lo = hex_value((unsigned char)target[i + 2])) < 0)
                return text_response(c, 400, "Bad Request", "Bad Request\n");
            ch = (unsigned char)((hi << 4) | lo);
            i += 2;
        }
        if (ch < 32 || ch == 127 || ch == '\\' || ch == '#')
            return text_response(c, 400, "Bad Request", "Bad Request\n");
        path[j++] = (char)ch;
    }
    path[j] = '\0';
    if (!strcmp(path, "d20")) {
        char roll[16];
        snprintf(roll, sizeof roll, "%d\n", rand() % 20 + 1);
        return text_response(c, 200, "OK", roll);
    }
    if (j == 0)
        strcpy(path, "index.html");
    /* open_request_file tokenizes its input; retain the name for MIME detection. */
    {
        char original[sizeof path];
        strcpy(original, path);
        if (prepare_file(c, root, original, path) == 0)
            return 0;
        if (errno != ENOENT && errno != ENOTDIR && errno != ELOOP &&
            errno != EACCES) {
            perror("opening requested file");
            return text_response(c, 500, "Internal Server Error", "Internal Server Error\n");
        }
    }
    return not_found(c, error_file);
}

static int read_request(int fd, struct client *c, int root, int error_file)
{
    char *end;
    ssize_t n = recv(fd, c->request + c->request_len,
                     REQUEST_SIZE - c->request_len, 0);
    if (n == 0)
        return -1;
    if (n < 0)
        return (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) ? 0 : -1;
    c->request_len += (size_t)n;
    c->request[c->request_len] = '\0';
    end = strstr(c->request, "\r\n\r\n");
    if (!end) end = strstr(c->request, "\n\n");
    if (end)
        return handle_request(c, root, error_file);
    if (memchr(c->request, '\0', c->request_len) != NULL)
        return text_response(c, 400, "Bad Request", "Bad Request\n");
    if (c->request_len == REQUEST_SIZE)
        return text_response(c, 431, "Request Header Fields Too Large", "Header too large\n");
    return 0;
}

static int write_response(int fd, struct client *c)
{
    ssize_t n;
    if (c->output_pos == c->output_len && c->remaining > 0) {
        size_t count = c->remaining > OUTPUT_SIZE ? OUTPUT_SIZE : (size_t)c->remaining;
        n = pread(c->file, c->output, count, c->file_offset);
        if (n <= 0) {
            if (n < 0) perror("pread");
            return -1;
        }
        c->remaining -= n;
        c->file_offset += n;
        c->output_len = (size_t)n;
        c->output_pos = 0;
    }
    if (c->output_pos == c->output_len)
        return -1;
    n = send(fd, c->output + c->output_pos, c->output_len - c->output_pos, 0);
    if (n < 0)
        return (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) ? 0 : -1;
    if (n == 0)
        return -1;
    c->output_pos += (size_t)n;
    return (c->output_pos == c->output_len && c->remaining == 0) ? -1 : 0;
}

int main(void)
{
    struct pollfd *fds = calloc(2 * (MAX_CLIENTS + 1), sizeof *fds);
    struct client **clients = calloc(MAX_CLIENTS + 1, sizeof *clients);
    size_t count = 1;
    int listener, root, error_file;
    time_t now, accept_retry = 0;
    const char *listen_port = getenv("WEB_PORT");
    const char *configured_api_port = getenv("EXAM_API_PORT");
    if (!listen_port || !*listen_port) listen_port = PORT;
    if (configured_api_port && *configured_api_port) {
        char *end;
        unsigned long parsed = strtoul(configured_api_port, &end, 10);
        if (*end || parsed < 1 || parsed > 65535) {
            fprintf(stderr, "EXAM_API_PORT must be between 1 and 65535\n");
            return EXIT_FAILURE;
        }
        api_port = (unsigned short)parsed;
    }
    if (!fds || !clients) {
        fprintf(stderr, "cannot allocate connection table\n");
        return EXIT_FAILURE;
    }
    root = open("./serverroot/dist", O_RDONLY | O_DIRECTORY);
    error_file = open("./serverfiles/404.html", O_RDONLY);
    if (root < 0 || error_file < 0) {
        perror("opening server files");
        return EXIT_FAILURE;
    }
    listener = get_listener_socket((char *)listen_port);
    if (listener < 0 || nonblocking(listener) < 0) {
        perror("listener");
        return EXIT_FAILURE;
    }
    signal(SIGPIPE, SIG_IGN);
    signal(SIGINT, stop_server);
    signal(SIGTERM, stop_server);
    srand((unsigned)time(NULL));
    fds[0].fd = listener;
    fds[0].events = POLLIN;
    printf("webserver: listening on port %s\n", listen_port);
    fflush(stdout);

    while (!stopping) {
        size_t i;
        int ready;
        size_t poll_count = count;
        now = monotonic_seconds();
        fds[0].events = count <= MAX_CLIENTS && now >= accept_retry ? POLLIN : 0;
        for (i = 1; i < count; i++) {
            struct api_proxy *proxy = clients[i]->proxy;
            if (!proxy) continue;
            proxy->poll_index = poll_count;
            fds[poll_count].events = proxy_upstream_events(proxy);
            fds[poll_count].fd = fds[poll_count].events ? proxy->fd : -1;
            fds[poll_count].revents = 0;
            poll_count++;
        }
        ready = poll(fds, (nfds_t)poll_count, 1000);
        if (ready < 0) {
            if (errno == EINTR) continue;
            perror("poll");
            break;
        }
        now = monotonic_seconds();
        for (i = 1; i < count; i++)
            if (clients[i]->proxy)
                clients[i]->proxy->revents = fds[clients[i]->proxy->poll_index].revents;
        if (fds[0].revents & POLLIN) {
            for (i = 0; i < 128 && count <= MAX_CLIENTS; i++) {
                struct sockaddr_storage peer;
                socklen_t peer_length = sizeof peer;
                int fd = accept(listener, (struct sockaddr *)&peer, &peer_length);
                struct client *c;
                if (fd < 0) {
                    if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
                        perror("accept");
                        accept_retry = now + 1;
                    }
                    break;
                }
                if (nonblocking(fd) < 0) {
                    perror("fcntl");
                    close(fd);
                    continue;
                }
                c = calloc(1, sizeof *c);
                if (!c) {
                    fprintf(stderr, "cannot allocate client\n");
                    close(fd);
                    break;
                }
                c->file = -1;
                c->local_peer = is_loopback(&peer);
                c->last_active = now;
                fds[count].fd = fd;
                fds[count].events = POLLIN;
                fds[count].revents = 0;
                clients[count++] = c;
            }
        }
        for (i = 1; i < count;) {
            struct client *c = clients[i];
            short events = fds[i].revents;
            int done = 0;
            if (c->proxy) {
                int result = proxy_step(c->proxy, fds[i].fd, events);
                if (result == 502) {
                    if (c->proxy->fd >= 0) close(c->proxy->fd);
                    free(c->proxy);
                    c->proxy = NULL;
                    done = text_response(c, 502, "Bad Gateway", "Exam service unavailable\n") < 0;
                } else done = result < 0;
            } else if (events & (POLLERR | POLLNVAL))
                done = 1;
            else if (!c->writing && (events & (POLLIN | POLLHUP)))
                done = read_request(fds[i].fd, c, root, error_file) < 0;
            else if (c->writing && (events & POLLOUT))
                done = write_response(fds[i].fd, c) < 0;
            else if (events & POLLHUP)
                done = 1;
            if ((events & (POLLIN | POLLOUT)) || (c->proxy && (c->proxy->revents & (POLLIN | POLLOUT))))
                c->last_active = now;
            if (now - c->last_active >= IDLE_SECONDS)
                done = 1;
            if (done) {
                close_client(&fds[i], c);
                --count;
                fds[i] = fds[count];
                clients[i] = clients[count];
            } else {
                fds[i].events = c->proxy ? proxy_client_events(c->proxy) : c->writing ? POLLOUT : POLLIN;
                i++;
            }
        }
    }
    while (count > 1) {
        --count;
        close_client(&fds[count], clients[count]);
    }
    close(listener);
    close(root);
    close(error_file);
    free(fds);
    free(clients);
    return stopping ? EXIT_SUCCESS : EXIT_FAILURE;
}
