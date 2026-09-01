# StreamEdu

StreamEdu is a premium, Netflix-inspired local video streaming platform built to organize, watch, and download educational videos effortlessly.

## ✨ Features
- **Netflix-Style Interface**: Beautiful dark mode UI with cinematic hero sections, smooth hover animations, and horizontal slider rows.
- **Binge-Watch Ready**: Built-in "Next Lesson" functionality automatically detects playlists and queues the next video with a seamless 5-second countdown overlay when an episode ends.
- **YouTube Downloading Engine**: Integrated with `yt-dlp` to directly download videos and entire playlists from YouTube right into your server with a simple URL, including automatic metadata, descriptions, and chapters fetching!
- **Library Organization**: Easy-to-use folder management, allowing you to organize your courses and playlists. Upload local videos directly from the browser.
- **Smart Metadata Parsing**: Automatically parses YouTube chapters into clickable timestamps and formats video descriptions elegantly in the sidebar.
- **Watch History tracking**: Remembers where you left off.
- **User Authentication**: Secure multi-user login with granular permission controls (Admins vs Users).

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) installed on your system.
- `yt-dlp.exe` placed in the root folder (if you want to use the download feature on Windows).

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/jabberdhami/StreamEdu.git
   cd StreamEdu
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
1. Start the server by running:
   ```bash
   node server.js
   ```
   *Alternatively, if on Windows, you can just double-click the `StartStreamHub.bat` file!*
2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
3. **Default Login**:
   - **Username**: `jabber`
   - **Password**: `jabber`

*(Note: The `Videos` folder is intentionally excluded from the repository to prevent uploading heavy media files. You can create the `Videos` folder locally or the app will generate one for you when you upload/download your first video).*

## 🛠 Tech Stack
- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Backend**: Node.js, Express.js
- **Media Engine**: HTML5 Video Player, `yt-dlp`
