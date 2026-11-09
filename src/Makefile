CC ?= cc
CPPFLAGS ?= -D_POSIX_C_SOURCE=200809L
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic
LDFLAGS ?=
LDLIBS ?=

OBJS = server.o net.o mime.o proxy.o

all: server

server: $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $(OBJS) $(LDLIBS)

server.o: server.c net.h mime.h proxy.h
proxy.o: proxy.c proxy.h
net.o: net.c net.h
mime.o: mime.c mime.h

cache_tests/cache_tests: cache_tests/cache_tests.c cache.c hashtable.c llist.c
	$(CC) $(CPPFLAGS) $(CFLAGS) $^ $(LDFLAGS) $(LDLIBS) -o $@

tests: cache_tests/cache_tests
	sh ./cache_tests/runtests.sh

test: tests

server-test: server
	node server_tests/integration.js
	node --test server_tests/proxy.test.cjs

clean:
	rm -f $(OBJS) server server.exe cache_tests/cache_tests cache_tests/cache_tests.exe cache_tests/cache_tests.log

.PHONY: all clean test tests server-test
