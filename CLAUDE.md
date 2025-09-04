# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Pulse Memorial is a web-based tribute utilizing Cloudflare Workers, Durable Objects, and a SolidJS frontend. It's a continuous audio broadcast memorial system using WebRTC (Janus Gateway) for real-time communication.

## Architecture

- **Backend**: Cloudflare Workers with Hono framework (`src/`)
  - `src/index.ts`: Main Hono app with CORS, basic auth, and routing
  - `src/pulseserver.ts`: Durable Object for persistent state management
  - `src/upload.ts`: File upload handling with R2 storage
- **Frontend**: SolidJS with Vite (`ui/`)
  - `ui/src/app.tsx`: Main application component
  - `ui/src/admin.tsx`: Admin interface
  - `ui/src/upload.tsx`: File upload component
  - Uses Tailwind CSS with DaisyUI components
- **Assets**: Static files served directly (`assets/`)
- **Configuration**: 
  - Cloudflare configuration in `wrangler.toml`
  - Uses Durable Objects, R2 storage, and email bindings

## Common Commands

### Development
- `bun run dev`: Start Cloudflare Workers dev server with remote execution
- `bun run build`: Build the UI components (runs `cd ui; bun run build`)
- `bun run deploy`: Deploy to Cloudflare with minification

### UI Development (in ui/ directory)
- `bun run dev`: Start Vite development server
- `bun run build`: Build for production (TypeScript + Vite)
- `bun run preview`: Preview production build

### Infrastructure
- Uses Cloudflare Workers with Node.js compatibility
- Durable Objects binding: `PULSE_SERVER` 
- R2 bucket binding: `MY_BUCKET`
- Email service bindings configured for two recipients
- WebRTC integration via Janus Gateway (global `Janus` available in browser)

## Key Technologies

- **Backend**: Hono, TypeScript, Cloudflare Workers
- **Frontend**: SolidJS, Vite, Tailwind CSS, DaisyUI
- **Storage**: Cloudflare R2
- **Real-time**: WebRTC (Janus Gateway), WebSockets
- **Audio**: Media recording with `extendable-media-recorder`

## Authentication

Basic auth configured for `/files` endpoints:
- Username: `admin`
- Password: `pulse`

## Development Notes

- UI uses TypeScript strict mode with Vite
- ESLint configured with Hono preset and browser globals for assets
- CORS enabled for localhost:5173 during development
- Uses Volta for Node.js version management (v20.9.0)

## Code Style Guidelines

- Use `bun` and `bunx` instead of `npm` or `npx`
- No semicolons - rely on ASI (Automatic Semicolon Insertion)
- No trailing whitespace at end of lines
- Use camelCase for file names and function names
- Prefer very minimal designs with fewer `<div>` elements
- Practice functional programming style:
  - Prefer ternary conditionals over if statements
  - Use Promises over async/await for async functions
  - Favor immutable data patterns and pure functions