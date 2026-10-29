#!/bin/bash
# Prints a line only when a preview reply was sent or the check failed.
set -u
root=/home/bk/Work/nle-us-test
log=/tmp/nle-mail-watch.log
lock=/tmp/nle-mail-watch.lock
prompt=$root/watch_nle_mail.prompt

while true; do
  if flock -n "$lock" grok --cwd "$root" --always-approve --max-turns 12 --prompt-file "$prompt" > /tmp/nle-mail-last.txt 2>>"$log"; then
    if grep -q '^FAILED' /tmp/nle-mail-last.txt; then
      grep '^FAILED' /tmp/nle-mail-last.txt
    elif grep -q '^SENT' /tmp/nle-mail-last.txt; then
      echo "ACTION_REQUIRED: $(grep '^SENT' /tmp/nle-mail-last.txt | tail -1)"
    fi
  fi
  sleep 60
done
