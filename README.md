# B.Tech CSE Paper Hub

A full-stack question-paper library built with React + Vite, Node.js + Express, MongoDB, and Cloudinary.

## Features
- Students can browse/search papers without registering or logging in.
- Filter by semester, subject, exam type (MTE/ETE), academic year, and file type.
- Store one paper for multiple semesters and use a four-digit academic year such as `2025`.
- Preview PDFs and images inside the website.
- Download links are available, but downloading is not required to view files.
- Admin can upload, edit metadata, and delete papers.
- Admin upload/delete routes are protected by a server-side password.
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
- Never commit `.env` files to GitHub.
- The sample `.env.example` uses `admin@123` for the requested local demo. Change it to a strong unique password before deploying publicly.
- The admin password is checked by the server. Students do not need accounts.
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
