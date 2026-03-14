#!/bin/bash
lsof -t -i:8080 | xargs kill -9 2>/dev/null
cargo run > /tmp/server.log 2>&1 &
echo $! > /tmp/server.pid
sleep 2
