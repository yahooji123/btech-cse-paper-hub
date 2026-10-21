# B.Tech CSE Paper Hub

A full-stack question-paper library built with React + Vite, Node.js + Express, MongoDB, and Cloudinary.

## Features
- Students can browse/search papers without registering or logging in.
- Filter by semester, subject, exam type (MTE/ETE), academic year, and file type.
- Store one paper for multiple semesters and use a four-digit academic year such as `2025`.
- Preview PDFs and images inside the website.
- Download links are available, but downloading is not required to view files.
- Admin can upload, edit metadata, and delete papers.
- Admin can use Gemini AI to extract paper metadata from an uploaded PDF/image before reviewing and publishing it.
- Admin can re-analyze papers already stored in Cloudinary from the edit form and review the suggested metadata before saving.
- Uploads are protected against duplicate titles, including older papers that were added before duplicate tracking was enabled.
- Admin upload/delete routes are protected by a server-side password.
- Admin can turn maintenance mode on or off. When enabled, the public website shows a maintenance screen and public paper APIs are blocked; admin access remains available.
- Admin can turn missing-paper requests on or off. When enabled, students see an animated navbar ticker and can submit requests for papers that are not available.
- Admin can publish a custom announcement from the admin panel and show or hide it for visitors.
- Admin can show or hide a post-download feedback card where students submit a rating and optional message.
- Papers uploaded within the last 3 days automatically receive a `NEW` badge.
- Students can open Paper AI on any paper and ask questions about its content and exam preparation.
- Each paper allows a maximum of 15 AI questions in total across all users.
- Admin can show or hide the Paper AI button from the admin panel.
- Files are uploaded to Cloudinary; metadata is stored in MongoDB.

## Requirements
- Node.js 18+
- MongoDB Atlas or local MongoDB
- Cloudinary account

## Setup

### 1. Configure backend
```bash
cd server
cp .env.example .env
```
Edit `server/.env` and set:
- `MONGODB_URI`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_PASSWORD` (defaults to `admin@123` for local setup; change it before public deployment)
- `ADMIN_SESSION_SECRET` (long random secret)
- `GEMINI_API_KEY` (Google AI Studio API key for Smart Upload)
- `GROQ_API_KEY` (required for Paper AI chat; also used as the image-upload fallback when Gemini fails)
- `GROQ_MODEL` (optional Groq vision model for upload fallback; defaults to `qwen/qwen3.8-27b`)
- `GROQ_CHAT_MODEL` (optional Groq vision model for Paper AI chat; defaults to `GROQ_MODEL`)

Install and run:
```bash
npm install
npm run dev
```
The API runs at `http://localhost:5000`.

### 2. Configure frontend
Open another terminal:
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Open the Vite URL printed in your terminal (usually `http://localhost:5173`).

## Cloudinary setup
In the Cloudinary dashboard, copy the Cloud Name, API Key, and API Secret into `server/.env`.
The server uploads files directly to Cloudinary from memory, so uploads are not saved to the server's local disk.

## Security notes
- Do not put admin passwords or Cloudinary secrets in React/Vite environment variables.
- Do not put `GEMINI_API_KEY` in React/Vite environment variables; Smart Upload sends files through the server.
- Never commit `.env` files to GitHub.
- The sample `.env.example` uses `admin@123` for the requested local demo. Change it to a strong unique password before deploying publicly.
- The admin password is checked by the server. Students do not need accounts.
- Smart Upload analyzes a file first and fills the metadata form; review the values before clicking Upload paper.
- If Gemini is unavailable, Smart Upload automatically tries Groq for image uploads. PDF extraction still requires Gemini.
- For a public production deployment, use HTTPS and consider adding rate limiting, upload limits, and a stronger admin identity/session system.
- This project uses a simple server-side admin token for the admin panel. It is suitable as a starter project, not a replacement for a full identity provider.

## Deploying
- Deploy `server` to Render or another Node host.
- Set the backend environment variables in the host dashboard.
- Deploy `client` to Vercel/Netlify/Render static hosting.
- Set the frontend `VITE_API_URL` to the deployed API URL, e.g. `https://your-api.onrender.com/api`.
- Configure `CLIENT_ORIGIN` on the backend to the deployed frontend URL.
- Ensure your Cloudinary account's delivery settings allow the intended PDF/image previews.

## File preview behavior
- Images open in an in-page modal.
- PDFs are embedded using an iframe and should open inline if Cloudinary delivery settings/browser support permit it.
- If a PDF provider/browser forces download, use Cloudinary's delivery settings or a server-side PDF proxy configured for inline `Content-Disposition`.
