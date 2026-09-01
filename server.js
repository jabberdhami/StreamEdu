const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

const WORKSPACE_DIR = __dirname;
const BASE_DIR = path.join(__dirname, 'Videos');

// Ensure Videos directory exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// --- Authentication Setup ---
const DATA_DIR = path.join(WORKSPACE_DIR, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(USERS_FILE)) {
    // Default admin user (jabber/jabber)
    const defaultAdminHash = crypto.createHash('sha256').update('jabber').digest('hex');
    fs.writeFileSync(USERS_FILE, JSON.stringify({
        users: [{ username: 'jabber', password: defaultAdminHash, role: 'admin' }]
    }, null, 2));
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users;
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// --- History Setup ---
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
}

function getHistory() {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

const activeSessions = new Map(); // token -> username

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth Endpoints
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username);
    
    if (user && user.password === hashPassword(password)) {
        if (user.isSuspended) {
            return res.status(403).json({ error: 'Account suspended' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.set(token, user.username);
        res.json({ 
            token, 
            username: user.username, 
            role: user.role, 
            profilePic: user.profilePic,
            displayName: user.displayName,
            canManageVideos: user.canManageVideos || false
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        activeSessions.delete(token);
    }
    res.json({ success: true });
});

// Protect routes middleware
function requireAuth(req, res, next) {
    let token = null;
    if (req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }
    
    if (!token || !activeSessions.has(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = activeSessions.get(token);
    next();
}

function requireAdmin(req, res, next) {
    const users = getUsers();
    const user = users.find(u => u.username === req.user);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

function requireVideoManagement(req, res, next) {
    const users = getUsers();
    const user = users.find(u => u.username === req.user);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role === 'admin' || user.canManageVideos) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden: You do not have permission to manage videos' });
    }
}

// User Management APIs
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
    const users = getUsers().map(u => ({ 
        username: u.username, 
        role: u.role, 
        isSuspended: u.isSuspended, 
        profilePic: u.profilePic,
        canManageVideos: u.canManageVideos || false
    }));
    res.json(users);
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const users = getUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    users.push({ username, password: hashPassword(password), role: role || 'user' });
    saveUsers(users);
    res.json({ success: true });
});

app.put('/api/users/:username', requireAuth, requireAdmin, (req, res) => {
    const { password, role, isSuspended } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === req.params.username);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (password) user.password = hashPassword(password);
    if (role) user.role = role;
    if (typeof isSuspended === 'boolean') {
        if (user.username === 'jabber') return res.status(400).json({ error: 'Cannot suspend default admin' });
        user.isSuspended = isSuspended;
    }
    if (typeof req.body.canManageVideos === 'boolean') {
        user.canManageVideos = req.body.canManageVideos;
    }
    
    saveUsers(users);
    res.json({ success: true });
});

app.delete('/api/users/:username', requireAuth, requireAdmin, (req, res) => {
    let users = getUsers();
    if (req.params.username === 'jabber') {
        return res.status(400).json({ error: 'Cannot delete default admin' });
    }
    users = users.filter(u => u.username !== req.params.username);
    saveUsers(users);
    res.json({ success: true });
});
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const profileUpload = multer({ dest: path.join(__dirname, 'public', 'profiles') });

app.post('/api/profile-pic', requireAuth, profileUpload.single('profilePic'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const users = getUsers();
    const currentUser = users.find(u => u.username === req.user);
    const isAdmin = currentUser && currentUser.role === 'admin';
    const targetUsername = (req.query.targetUser && isAdmin) ? req.query.targetUser : req.user;
    
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `${targetUsername}${ext}`;
    const targetPath = path.join(__dirname, 'public', 'profiles', filename);
    
    // Rename/move file from multer temp to target
    fs.renameSync(req.file.path, targetPath);
    
    // Update users.json
    const userIndex = users.findIndex(u => u.username === targetUsername);
    if (userIndex !== -1) {
        users[userIndex].profilePic = `/profiles/${filename}?t=${Date.now()}`;
        saveUsers(users);
        res.json({ success: true, profilePic: users[userIndex].profilePic });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.put('/api/profile', requireAuth, (req, res) => {
    const { displayName } = req.body;
    let users = getUsers();
    const user = users.find(u => u.username === req.user);
    if (user) {
        user.displayName = displayName;
        saveUsers(users);
        res.json({ success: true, displayName: user.displayName });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Watch History Endpoints
app.get('/api/progress', requireAuth, (req, res) => {
    const history = getHistory();
    const userHistory = history[req.user] || {};
    res.json(userHistory);
});

app.post('/api/progress', requireAuth, (req, res) => {
    const { videoPath, progress, duration } = req.body;
    if (!videoPath) return res.status(400).json({ error: 'Video path required' });

    const history = getHistory();
    if (!history[req.user]) history[req.user] = {};
    
    history[req.user][videoPath] = {
        progress,
        duration,
        lastWatched: Date.now()
    };
    
    saveHistory(history);
    res.json({ success: true });
});

// Secure video serving
app.use('/videos', requireAuth, express.static(BASE_DIR));

// SSE Clients
let clients = [];

app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);
  
  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

function broadcastEvent(type, data) {
  clients.forEach(client => {
    client.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const targetFolder = req.body.folder || '.';
    const uploadPath = path.join(BASE_DIR, targetFolder);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
function getDirectoryStructure(dir, relativePath = '') {
  let result = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (item.name === 'node_modules' || item.name.startsWith('.') || item.name === 'public' || item.name === 'server.js' || item.name === 'package.json' || item.name === 'package-lock.json' || item.name === 'yt-dlp.exe') {
      continue;
    }

    const itemPath = path.join(dir, item.name);
    const itemRelativePath = path.join(relativePath, item.name).replace(/\\/g, '/');

    if (item.isDirectory()) {
      result.push({
        type: 'folder',
        name: item.name,
        path: itemRelativePath,
        children: getDirectoryStructure(itemPath, itemRelativePath)
      });
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext)) {
        const encodedPath = itemRelativePath.split('/').map(encodeURIComponent).join('/');
        const baseName = item.name.substring(0, item.name.lastIndexOf('.'));
        const hasDescription = fs.existsSync(path.join(dir, baseName + '.description'));
        const hasInfoJson = fs.existsSync(path.join(dir, baseName + '.info.json'));
        const basePath = itemRelativePath.substring(0, itemRelativePath.lastIndexOf('.'));
        const encodedBasePath = basePath.split('/').map(encodeURIComponent).join('/');

        result.push({
          type: 'video',
          name: item.name,
          path: itemRelativePath,
          url: `/videos/${encodedPath}`,
          descriptionUrl: hasDescription ? `/videos/${encodedBasePath}.description` : null,
          infoJsonUrl: hasInfoJson ? `/videos/${encodedBasePath}.info.json` : null
        });
      }
    }
  }
  return result;
}

app.get('/api/files', requireAuth, (req, res) => {
  try {
    const structure = getDirectoryStructure(BASE_DIR);
    res.json(structure);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

app.post('/api/download', requireAuth, requireVideoManagement, (req, res) => {
  const { url, folder } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const targetFolder = folder || '.';
  const downloadPath = path.join(BASE_DIR, targetFolder);
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

  const ytDlpPath = path.join(WORKSPACE_DIR, 'yt-dlp.exe');
  const outputTemplate = downloadPath.replace(/\\/g, '/') + '/%(playlist_title|)s%(playlist_title&/|)s%(title)s.%(ext)s';
  const args = [
    url,
    '-o', outputTemplate,
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--write-description',
    '--write-info-json',
    '--embed-chapters'
  ];
  
  const child = spawn(ytDlpPath, args);
  const taskId = Date.now().toString();

  broadcastEvent('download-start', { id: taskId, url });

  child.stdout.on('data', (data) => {
    const output = data.toString();
    const progressMatch = output.match(/\[download\]\s+([\d\.]+)%/);
    if (progressMatch) broadcastEvent('download-progress', { id: taskId, progress: progressMatch[1] });
  });

  child.on('close', (code) => {
    broadcastEvent('download-complete', { id: taskId });
    broadcastEvent('refresh', {});
  });

  res.json({ message: 'Download started in the background.', id: taskId });
});

app.post('/api/upload', requireAuth, requireVideoManagement, upload.array('video'), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  broadcastEvent('refresh', {});
  
  let targetFolder = req.body.folder || '';
  // Auto-group multi-file uploads into a folder if not specified
  if (req.files.length > 1 && !targetFolder) {
      targetFolder = req.files[0].originalname.replace(/\.[^/.]+$/, "") + ' (Batch)';
  }
  if (targetFolder) {
      const fullTargetFolder = path.join(BASE_DIR, targetFolder);
      if (!fs.existsSync(fullTargetFolder)) fs.mkdirSync(fullTargetFolder, { recursive: true });
  }

  const uploadedFiles = [];
  req.files.forEach(file => {
      const targetPath = path.join(BASE_DIR, targetFolder, file.originalname);
      fs.renameSync(file.path, targetPath);
      uploadedFiles.push(targetPath);
  });
  res.json({ message: 'Files uploaded successfully', count: req.files.length });
});

app.post('/api/folder', requireAuth, requireVideoManagement, (req, res) => {
  const { path: folderPath, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });

  const newFolderPath = path.join(BASE_DIR, folderPath || '.', name);
  try {
    if (!fs.existsSync(newFolderPath)) {
      fs.mkdirSync(newFolderPath, { recursive: true });
      broadcastEvent('refresh', {});
      res.json({ message: 'Folder created successfully' });
    } else {
      res.status(400).json({ error: 'Folder already exists' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

app.delete('/api/video', requireAuth, requireVideoManagement, (req, res) => {
  const { videoPath } = req.body;
  if (!videoPath) return res.status(400).json({ error: 'Video path required' });
  
  const fullPath = path.join(BASE_DIR, videoPath);
  // Security check: prevent directory traversal
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(BASE_DIR)) {
      return res.status(403).json({ error: 'Invalid path' });
  }
  
  try {
      if (fs.existsSync(normalizedPath)) {
          fs.unlinkSync(normalizedPath);
          broadcastEvent('refresh', {});
          res.json({ success: true });
      } else {
          res.status(404).json({ error: 'Video not found' });
      }
  } catch(e) {
      res.status(500).json({ error: 'Failed to delete video' });
  }
});

app.post('/api/shutdown', requireAuth, requireAdmin, (req, res) => {
  res.json({ message: 'Server is shutting down...' });
  console.log('Shutdown requested by admin. Exiting in 1 second...');
  setTimeout(() => process.exit(0), 1000);
});

// Auto-refresh when files are modified in the backend
let watchTimeout = null;
fs.watch(BASE_DIR, { recursive: true }, (eventType, filename) => {
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
        broadcastEvent('refresh', {});
    }, 1000); // Debounce to prevent spamming refreshes
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
