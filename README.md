# Nexus Messenger

> **A secure-first, local-first messenger built around privacy, speed and simplicity.**

Nexus Messenger is an experimental open-source messaging client focused on a different philosophy than traditional messengers.

Instead of building another cloud-based platform where your account becomes your identity, Nexus treats the client as the primary owner of your data.

The server is designed to be as lightweight as possible. It acts mainly as a secure real-time relay and temporary delivery bridge, while chat history belongs to the user and stays on the user's device.

---

## Philosophy

Modern messengers usually revolve around accounts.

Phone numbers.

Cloud backups.

Permanent server-side history.

Nexus takes another approach.

- Local-first architecture
- Minimal server responsibility
- End-to-end encrypted communication
- No phone number
- No email
- Username only
- Open-source client
- Fast startup
- Lightweight backend

Your identity is simply your username.

Your conversations belong to your device.

---

## Current Project Status

> ⚠️ Nexus Messenger is currently an experimental MVP.

The project is under active development and should not yet be considered production-ready.

The main goals of the project are:

- explore local-first messaging
- experiment with AI-first software development
- build an elegant developer-friendly architecture
- create a modern messenger inspired by minimalism and cyber aesthetics

---

# Downloads

Android APK builds are available in the **GitHub Releases** section.

Simply download the latest APK and install it on your Android device.

The public Nexus server is already running, so you can use the application completely free of charge.

No self-hosting is required.

---

## Open Source

This repository contains **only the mobile client**.

The backend is intentionally kept private.

Reasons:

- server infrastructure is continuously changing
- deployment configuration contains production-specific logic
- keeping the backend private allows easier maintenance while keeping the client fully transparent

The client remains completely open-source under the **GNU AGPL v3** license.

---

# Features

Current MVP includes:

- Secure Direct Messages
- Groups
- Broadcast Channels
- Ghost Chats
- Local SQLite storage
- Message reactions
- Replies
- Saved Messages
- Auto-delete timers
- Push notifications
- Media sharing
- Voice messages
- User profiles
- Themes and customization
- User search
- Read receipts
- Privacy settings
- Export chats (MVP)

---

# Architecture

```
                Nexus Messenger

     Open Source Client
            │
            │
    Encrypted Messages
            │
            ▼
  Lightweight Relay Server
            │
            │
 Temporary Store-and-Forward
            │
            ▼
      Recipient Device

Chat history never lives permanently on the server.
```

Unlike traditional messengers, the server is **not** intended to become a permanent storage for user conversations.

Instead it works as a lightweight relay:

1. Messages are encrypted on the client.
2. They are transmitted through the server.
3. If the recipient is offline, the server temporarily stores the encrypted message.
4. As soon as delivery succeeds, pending messages are removed.
5. Conversation history remains stored locally on user devices.

---

# Technical Overview

## Client

- Expo SDK 54
- React Native 0.81
- TypeScript
- Expo Router
- SQLite
- SecureStore
- WebSocket
- React Native Reanimated

## Server

- Go
- net/http
- gorilla/websocket
- JSON or PostgreSQL storage
- Store-and-forward architecture
- AES-256-GCM encrypted storage for pending messages

---

## Technical Architecture

(Paste your architecture diagram here.)

---

## Security

Current implementation includes:

- End-to-End Encryption (experimental MVP implementation)
- Local encrypted storage
- Secure key storage
- Username-only identity
- No phone number
- No email
- Secure WebSocket transport

> **Note:** The current cryptographic implementation is still evolving and should not yet be considered independently audited.

---

## User Data

Nexus intentionally stores as little information as possible.

Server stores:

- username
- authentication token
- public profile
- temporarily undelivered encrypted messages

Server does **not** permanently store:

- chat history
- local conversations
- media history after successful delivery

---

## Building

### Requirements

- Node.js 20+
- Expo SDK 54

Install dependencies

```bash
npm install
```

Run

```bash
npx expo start
```

Android

```bash
npx expo run:android
```

iOS

```bash
npx expo run:ios
```

Web

```bash
npx expo start --web
```

---

## Roadmap

Planned improvements:

- Better cryptography (Ed25519 + X25519)
- Performance improvements
- Desktop client
- Better synchronization
- Improved Ghost Chats
- Security audit
- Plugin architecture
- GIANT BUGFIXES

---

## License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0).**

This guarantees that improvements to the open-source client remain open for the community.

---

## About

Nexus Messenger is a personal experimental project exploring what a modern privacy-oriented messenger could look like in an AI-first development era.

The project is developed primarily for learning, experimentation and open collaboration.