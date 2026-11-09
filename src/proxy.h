#ifndef HEAP_PROXY_H
#define HEAP_PROXY_H

#include <stddef.h>
#include <poll.h>

#define PROXY_BUFFER_SIZE 16384

struct api_proxy {
    int fd;
    int connecting;
    int upstream_eof;
    int response_started;
    size_t body_remaining;
    size_t up_pos, up_len;
    size_t down_pos, down_len;
    short revents;
    size_t poll_index;
    char up[PROXY_BUFFER_SIZE];
    char down[PROXY_BUFFER_SIZE];
};

int proxy_start(struct api_proxy *p, const char *request, size_t length,
                const char *method, const char *target, unsigned short port);
short proxy_client_events(const struct api_proxy *p);
short proxy_upstream_events(const struct api_proxy *p);
int proxy_step(struct api_proxy *p, int client, short client_events);

#endif
