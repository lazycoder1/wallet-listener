# Guide: Using tmux to Run ngrok in a Detached Session

This guide explains how to create a tmux session, run ngrok in it, detach from the session, and re-enter it later. This is useful for keeping ngrok running in the background while you do other work.

---

## 1. Install tmux (if not already installed)

On macOS:
```sh
brew install tmux
```

On Ubuntu/Debian:
```sh
sudo apt-get install tmux
```

---

## 2. Create a New tmux Session and Run ngrok

Replace `3001` with the port you want to expose.

```sh
tmux new -s ngrok
ngrok http 3001
```

- This creates a new tmux session named `ngrok` and opens a shell.
- Run your ngrok command inside the session.

---

## 3. Detach (Exit) from the tmux Session (ngrok keeps running)

Press:
```
Ctrl + b, then d
```
- This detaches you from the tmux session, but ngrok keeps running in the background.

---

## 4. Re-attach to the tmux Session

To re-enter the session and see ngrok's output:

```sh
tmux attach -t ngrok
```

---

## 5. Kill the tmux Session (Stop ngrok)

Inside the tmux session, press `Ctrl + C` to stop ngrok, then type:

```sh
exit
```
- This will close the tmux session.

Or, from outside tmux:
```sh
tmux kill-session -t ngrok
```

---

## 6. List All tmux Sessions

```sh
tmux ls
```

---

## Summary of Useful tmux Commands

- **Create new session:** `tmux new -s <session-name>`
- **Detach from session:** `Ctrl + b`, then `d`
- **Attach to session:** `tmux attach -t <session-name>`
- **List sessions:** `tmux ls`
- **Kill session:** `tmux kill-session -t <session-name>`

---

**Tip:** You can use tmux for any long-running process, not just ngrok! 