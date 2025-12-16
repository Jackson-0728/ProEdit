# ProEdit - Intelligent Writing Assistant

> **Writing, Reimagined with AI.**

ProEdit is a modern, collaborative text editor designed for speed and intelligence. It combines a distraction-free writing environment with advanced AI capabilities and real-time collaboration tools, helping teams create content that stands out.

![ProEdit Screenshot](https://github.com/Jackson-0728/ProEdit/blob/main/ProEdit%20Screenshot.png?raw=true)

## ✨ Key Features

### 🤖 AI-Powered Workflow
-   **Smart Assistance**: Ask Gemini to write, rewrite, or summarize content directly in the editor.
-   **ProStyle Component Builder**: Describe a UI component or layout, and watch ProStyle build it instantly using HTML/CSS.
-   **Contextual Editing**: Highlight any text to simplify, expand, or improve it with a single click.

### 👥 Real-Time Collaboration
-   **Co-Authoring**: Edit documents simultaneously with your team.
-   **Live Presence**: See who is viewing the document and where their cursor is in real-time.
-   **In-App Chat**: Discuss changes without leaving the document context.
-   **Granular Permissions**: Share with specific users as Viewers, Commenters, or Editors.

### 🚀 Modern Editor
-   **Rich Text**: All the formatting tools you need (Fonts, Colors, Lists).
-   **Slash Commands**: Type `/` to access AI tools and shortcuts instantly.
-   **Smart Navigation**: URL-based routing allows you to bookmark or share deep links to specific documents.
-   **Cloud Sync**: Documents are auto-saved and synced across devices via Supabase.

## 🛠 Tech Stack

-   **Frontend**: Vanilla JavaScript (ES6+), CSS3 Variables, HTML5 (Vite)
-   **Backend**: Node.js & Express (Proxy for AI requests)
-   **Database**: Supabase (PostgreSQL) + Realtime
-   **AI Model**: Google Gemini 2.5 (Flash, Lite, Pro)

## 🚀 Getting Started

### Prerequisites
-   Node.js (v16+)
-   Supabase Account
-   Google Cloud Project (for Gemini API)

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Jackson-0728/ProEdit.git
    cd ProEdit
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory:
    ```env
    # Supabase (Frontend & Auth)
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

    # Gemini AI (Server-side)
    VITE_GEMINI_API_KEY=your_gemini_api_key
    ```

4.  **Database & Auth Setup**
    -   In Supabase, enable **Email/Password** Auth.
    -   Run the `supabase_setup.sql` script in your Supabase SQL Editor to create tables for Documents, Comments, and Permissions.

5.  **Run the Application**
    You need two terminals:

    *Terminal 1: Backend Server (AI Proxy)*
    ```bash
    npm run server
    ```

    *Terminal 2: Frontend Client*
    ```bash
    npm run dev
    ```

    Open **http://localhost:5173** to start writing!

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
Copyright (c) 2025 Jackson Liu. All rights reserved.
