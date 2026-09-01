// DOM Elements
const catalogContainer = document.getElementById('catalog-container');
const videoPlayer = document.getElementById('video-player');
const videoPlaceholder = document.getElementById('video-placeholder');
const currentVideoTitle = document.getElementById('current-video-title');
const videoContainer = document.getElementById('video-container');
const appContent = document.getElementById('app-content');
const searchInput = document.getElementById('search-input');
const searchIcon = document.getElementById('search-icon');
const searchBox = document.querySelector('.search-box');

// Playlist Context State
let currentPlaylistContext = null;
let currentVideoIndex = -1;
let upNextTimeout = null;
const navbar = document.getElementById('navbar');

// Hero Elements
const heroSection = document.getElementById('hero-section');
const heroBackground = document.getElementById('hero-background');
const heroVideoBg = document.getElementById('hero-video-bg');
const heroTitle = document.getElementById('hero-title');
const heroDescription = document.getElementById('hero-description');
const heroPlayBtn = document.getElementById('hero-play-btn');

// Global Data
let globalFiles = [];
let currentFilter = 'all'; // all, videos, playlists
let watchHistory = {};
let currentPlayingVideo = null;

// Hero Carousel State
let heroTrendingItems = [];
let currentHeroIndex = 0;
let heroAutoRotateInterval = null;
let heroHoverTimeout = null;
let isHeroMuted = true;
const heroPagination = document.getElementById('hero-pagination');
const heroMuteBtn = document.getElementById('hero-mute-btn');

// Profile Update (Pic and Display Name)
document.getElementById('profile-pic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('profile-pic-input');
    const displayName = document.getElementById('profile-display-name').value;
    
    // Update Display Name if provided
    if (displayName !== undefined) {
        try {
            const dnRes = await fetch('/api/profile', {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ displayName })
            });
            const dnData = await dnRes.json();
            if (dnData.success) {
                // Keep the display name in local storage if needed or just rely on server
            }
        } catch (err) {
            console.error(err);
        }
    }
    
    // Upload Profile Pic if provided
    if (fileInput.files[0]) {
        const formData = new FormData();
        formData.append('profilePic', fileInput.files[0]);
        
        try {
            const res = await fetch('/api/profile-pic', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('user-avatar-icon').style.display = 'none';
                const img = document.getElementById('user-avatar-img');
                img.style.display = 'block';
                img.src = data.profilePic;
                
                document.getElementById('modal-profile-icon').style.display = 'none';
                const modalImg = document.getElementById('modal-profile-img');
                modalImg.style.display = 'block';
                modalImg.src = data.profilePic;
                
                // Save to local storage for persistence across reloads
                localStorage.setItem(PROFILE_PIC_KEY, data.profilePic);
            } else {
                alert(data.error);
                return;
            }
        } catch (err) {
            console.error(err);
            return;
        }
    }
    
    alert('Profile updated successfully!');
    closeModal('profile-modal');
    // Force reload to show display name change
    location.reload();
});

// --- Authentication ---
const TOKEN_KEY = 'streamhub_token';
const USERNAME_KEY = 'streamhub_username';
const ROLE_KEY = 'streamhub_role';
const PROFILE_PIC_KEY = 'streamhub_profilePic';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token, username, role, profilePic, canManageVideos) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(PROFILE_PIC_KEY, profilePic || '');
    localStorage.setItem('streamhub_canManageVideos', canManageVideos ? 'true' : 'false');
    checkAuth();
}
function logout() {
    apiFetch('/api/logout', { method: 'POST' }).then(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USERNAME_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(PROFILE_PIC_KEY);
        localStorage.removeItem('streamhub_canManageVideos');
        checkAuth();
    });
}

function checkAuth() {
    const token = getToken();
    const role = localStorage.getItem(ROLE_KEY);
    const canManageVideos = localStorage.getItem('streamhub_canManageVideos') === 'true';
    if (!token) {
        document.getElementById('login-overlay').style.display = 'flex';
        appContent.style.display = 'none';
    } else {
        document.getElementById('login-overlay').style.display = 'none';
        appContent.style.display = 'block';
        if (role === 'admin') {
            document.getElementById('manage-users-btn').style.display = 'block';
            document.getElementById('shutdown-server-btn').style.display = 'block';
        } else {
            document.getElementById('manage-users-btn').style.display = 'none';
            document.getElementById('shutdown-server-btn').style.display = 'none';
        }
        
        if (role === 'admin' || canManageVideos) {
            document.getElementById('new-folder-icon').style.display = 'flex';
            document.getElementById('add-video-icon').style.display = 'flex';
        } else {
            document.getElementById('new-folder-icon').style.display = 'none';
            document.getElementById('add-video-icon').style.display = 'none';
        }
        
        // Restore profile pic
        const profilePic = localStorage.getItem(PROFILE_PIC_KEY);
        if (profilePic) {
            document.getElementById('user-avatar-icon').style.display = 'none';
            const img = document.getElementById('user-avatar-img');
            img.style.display = 'block';
            img.src = profilePic;
            
            document.getElementById('modal-profile-icon').style.display = 'none';
            const modalImg = document.getElementById('modal-profile-img');
            modalImg.style.display = 'block';
            modalImg.src = profilePic;
        }
        
        fetchHistory().then(() => fetchFiles().then(() => checkUrlParamsForShare()));
        initSSE();
    }
}

// Wrapper for fetch to include auth token
async function apiFetch(url, options = {}) {
    const token = getToken();
    if (token) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        checkAuth();
        throw new Error('Unauthorized');
    }
    return res;
}

// Login Form
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            setToken(data.token, data.username, data.role, data.profilePic, data.canManageVideos);
            
            const nameToDisplay = data.displayName || data.username;
            showToast(`Welcome back, ${nameToDisplay}!`);
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) {
        showToast('Login failed', 'error');
    }
});

// Toast function
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// Modal functions
function openModal(modalId) {
    if (modalId === 'admin-modal') loadUsers();
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId !== 'playlist-modal') {
        const forms = document.querySelectorAll(`#${modalId} form`);
        forms.forEach(form => form.reset());
    }
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && overlay.id !== 'login-overlay') {
            closeModal(overlay.id);
        }
    });
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    if (tabId === 'upload') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        const content = document.getElementById('upload-form');
        content.classList.add('active');
        content.style.display = 'block';
    } else if (tabId === 'url') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        const content = document.getElementById('ytdlp-form');
        content.classList.add('active');
        content.style.display = 'block';
    }
}

// Navbar Scroll Effect
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Search Box Toggle
searchIcon.addEventListener('click', () => {
    searchBox.classList.toggle('active');
    if (searchBox.classList.contains('active')) {
        searchInput.focus();
    }
});

// Admin Users Logic// --- Admin Functions ---
async function loadUsers() {
    try {
        const res = await apiFetch('/api/users');
        const users = await res.json();
        const list = document.getElementById('users-list');
        list.innerHTML = '';
        users.forEach(u => {
            const isSuspended = u.isSuspended ? 'checked' : '';
            const row = document.createElement('div');
            row.className = 'user-row';
            row.style.background = '#222';
            row.style.padding = '10px';
            row.style.marginBottom = '5px';
            row.style.borderRadius = '4px';
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${u.profilePic || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                        <div style="font-weight:bold;">${u.username} <span class="user-role" style="background:#555; padding:2px 6px; font-size:12px; border-radius:4px;">${u.role}</span></div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <label style="font-size:12px; display:flex; align-items:center; gap:5px; cursor:pointer;">
                            <input type="checkbox" onchange="toggleSuspend('${u.username}', this.checked)" ${isSuspended}> Suspended
                        </label>
                        <label style="font-size:12px; display:flex; align-items:center; gap:5px; cursor:pointer;" title="Allow user to add/remove videos">
                            <input type="checkbox" onchange="toggleManageVideos('${u.username}', this.checked)" ${u.canManageVideos ? 'checked' : ''}> Manage Videos
                        </label>
                        <input type="password" id="pw-${u.username}" placeholder="New pass" style="padding:4px; width:100px; background:#444; border:none; color:#fff; border-radius:3px;">
                        <button onclick="changePass('${u.username}')" style="background:#333; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">Set Pass</button>
                        <label style="background:#333; color:#fff; padding:4px 8px; border-radius:3px; cursor:pointer; margin:0;">
                            Set Pic <input type="file" style="display:none;" accept="image/*" onchange="overrideProfilePic('${u.username}', this)">
                        </label>
                        ${u.username !== 'jabber' ? `<button onclick="deleteUser('${u.username}')" style="background:#e50914; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </div>
            `;
            list.appendChild(row);
        });
    } catch (err) {
        console.error('Failed to load users');
    }
}

async function toggleSuspend(username, isSuspended) {
    await apiFetch(`/api/users/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuspended })
    });
    showToast(`${username} ${isSuspended ? 'suspended' : 'activated'}`);
}

async function toggleManageVideos(username, canManageVideos) {
    await apiFetch(`/api/users/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canManageVideos })
    });
    showToast(`Manage Videos ${canManageVideos ? 'enabled' : 'disabled'} for ${username}`);
}

async function changePass(username) {
    const pass = document.getElementById(`pw-${username}`).value;
    if (!pass) return alert('Enter a password first');
    await apiFetch(`/api/users/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
    });
    document.getElementById(`pw-${username}`).value = '';
    showToast(`Password updated for ${username}`);
}

async function overrideProfilePic(username, fileInput) {
    if (!fileInput.files[0]) return;
    const formData = new FormData();
    formData.append('profilePic', fileInput.files[0]);
    try {
        const res = await fetch(`/api/profile-pic?targetUser=${username}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Profile picture updated for ${username}`);
            loadUsers();
        }
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    
    try {
        const res = await apiFetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        if (res.ok) {
            showToast('User added');
            document.getElementById('add-user-form').reset();
            loadUsers();
        } else {
            const data = await res.json();
            showToast(data.error, 'error');
        }
    } catch (e) {}
});

async function deleteUser(username) {
    if(!confirm(`Delete user ${username}?`)) return;
    try {
        const res = await apiFetch(`/api/users/${username}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('User deleted');
            loadUsers();
        }
    } catch(e) {}
}

// Watch History Logic
async function fetchHistory() {
    try {
        const res = await apiFetch('/api/progress');
        watchHistory = await res.json();
    } catch (e) {
        console.error('Failed to load history');
    }
}

let lastSaveTime = 0;
videoPlayer.addEventListener('timeupdate', () => {
    if (!currentPlayingVideo) return;
    const now = Date.now();
    if (now - lastSaveTime > 5000) {
        const progress = videoPlayer.currentTime;
        const duration = videoPlayer.duration;
        
        // Update local object immediately
        if (!watchHistory[currentPlayingVideo.path]) {
            watchHistory[currentPlayingVideo.path] = {};
        }
        watchHistory[currentPlayingVideo.path].progress = progress;
        watchHistory[currentPlayingVideo.path].duration = duration;
        watchHistory[currentPlayingVideo.path].lastWatched = now;

        // Save to server silently
        apiFetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoPath: currentPlayingVideo.path, progress, duration })
        }).catch(() => {});
        lastSaveTime = now;
    }
});


function extractFolders(items) {
    let folders = [];
    items.forEach(item => {
        if (item.type === 'folder') {
            folders.push(item.path);
            folders = folders.concat(extractFolders(item.children));
        }
    });
    return folders;
}

function updateFolderDropdowns() {
    const folders = extractFolders(globalFiles);
    const optionsHtml = `<option value="">Root / (No Folder)</option>` + 
        `<option value="NEW_FOLDER_OPTION">+ New Folder...</option>` +
        folders.map(f => `<option value="${f}">${f}</option>`).join('');
    
    const uploadSelect = document.getElementById('upload-path-select');
    if (uploadSelect) uploadSelect.innerHTML = optionsHtml;
    
    const ytdlpSelect = document.getElementById('ytdlp-path-select');
    if (ytdlpSelect) ytdlpSelect.innerHTML = optionsHtml;
}

window.toggleNewFolderInput = function(prefix) {
    const select = document.getElementById(`${prefix}-path-select`);
    const input = document.getElementById(`${prefix}-path-new`);
    if (select.value === 'NEW_FOLDER_OPTION') {
        input.style.display = 'block';
        input.required = true;
    } else {
        input.style.display = 'none';
        input.required = false;
        input.value = '';
    }
};

// API Calls
async function fetchFiles() {
    try {
        const res = await apiFetch('/api/files');
        globalFiles = await res.json();
        
        updateFolderDropdowns();
        
        const allVids = extractVideos(globalFiles);
        if (allVids.length > 0 && heroTrendingItems.length === 0) {
            // Shuffle and pick top 10
            const shuffled = [...allVids].sort(() => 0.5 - Math.random());
            heroTrendingItems = shuffled.slice(0, 10);
            renderHeroPagination();
        }

        renderCatalog(globalFiles);
    } catch (error) {
        console.error(error);
    }
}

// Search & Filtering
searchInput.addEventListener('input', (e) => {
    renderCatalog(globalFiles, e.target.value.toLowerCase());
});

function showCatalog(filter = 'all', event = null) {
    videoContainer.style.display = 'none';
    appContent.style.display = 'block';
    videoPlayer.pause();
    currentPlayingVideo = null;
    currentFilter = filter;
    
    if (event) {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        event.target.parentElement.classList.add('active');
    }
    
    // Refresh to update progress bars visually
    renderCatalog(globalFiles, searchInput.value.toLowerCase());
}

function renderCatalog(items, query = '') {
    catalogContainer.innerHTML = '';
    
    function filterNodes(nodes) {
        let result = [];
        for (const item of nodes) {
            if (item.type === 'folder') {
                const filteredChildren = filterNodes(item.children);
                if (filteredChildren.length > 0 || item.name.toLowerCase().includes(query)) {
                    result.push({ ...item, children: filteredChildren });
                }
            } else if (item.name.toLowerCase().includes(query)) {
                result.push(item);
            }
        }
        return result;
    }
    
    let filteredItems = query ? filterNodes(items) : items;

    const rootVideos = [];
    const folders = [];
    const allFilteredVideos = extractVideos(filteredItems);

    filteredItems.forEach(item => {
        if (item.type === 'folder') {
            const innerVideos = extractVideos(item.children);
            if (currentFilter === 'playlists' || currentFilter === 'all') {
                folders.push({ ...item, innerVideos });
            }
        } else {
            if (currentFilter === 'videos' || currentFilter === 'all') {
                rootVideos.push(item);
            }
        }
    });

    if (rootVideos.length === 0 && folders.length === 0) {
        catalogContainer.innerHTML = '<div style="text-align:center; margin-top:50px; color: var(--text-muted)">No videos found</div>';
        return;
    }

    // Set Hero Video
    if (heroTrendingItems.length > 0 && query === '' && currentFilter === 'all') {
        heroSection.style.display = 'block';
        catalogContainer.style.marginTop = '-100px';
        if (heroTitle.textContent === 'Welcome to Streamed') {
            setHeroIndex(0);
        }
    } else {
        heroSection.style.display = 'none';
        catalogContainer.style.marginTop = '80px';
        clearInterval(heroAutoRotateInterval);
    }

    // --- Dynamic Rows (History / Recommendations) ---
    if (query === '' && currentFilter === 'all') {
        const historyVideos = allFilteredVideos.filter(v => watchHistory[v.path])
            .sort((a, b) => (watchHistory[b.path]?.lastWatched || 0) - (watchHistory[a.path]?.lastWatched || 0));
        
        if (historyVideos.length > 0) {
            const username = localStorage.getItem(USERNAME_KEY);
            catalogContainer.appendChild(createVideoRow(`Continue Watching for ${username}`, historyVideos.slice(0, 15)));
        }

        // Recommendations (Because you watched)
        if (historyVideos.length > 0) {
            // Find folders of watched videos
            let watchedFolders = new Set();
            historyVideos.forEach(v => {
                const parts = v.path.split('/');
                if (parts.length > 1) watchedFolders.add(parts[0]);
            });

            if (watchedFolders.size > 0) {
                let recVideos = allFilteredVideos.filter(v => {
                    const parts = v.path.split('/');
                    return parts.length > 1 && watchedFolders.has(parts[0]) && !watchHistory[v.path];
                });
                
                // Shuffle recommendations
                recVideos = recVideos.sort(() => 0.5 - Math.random()).slice(0, 10);
                if (recVideos.length > 0) {
                    catalogContainer.appendChild(createVideoRow('Because you watched', recVideos));
                }
            }
        }
    }

    // --- Render Main Content ---
    if (currentFilter === 'videos' || currentFilter === 'all') {
        if (rootVideos.length > 0) {
            catalogContainer.appendChild(createVideoRow(currentFilter === 'videos' ? 'All Videos' : 'Recently Added', rootVideos));
        }
    }

    if (currentFilter === 'playlists' || currentFilter === 'all') {
        if (folders.length > 0) {
            // For playlists, we render CARDS representing folders in a single row
            catalogContainer.appendChild(createPlaylistRow(currentFilter === 'playlists' ? 'All Playlists' : 'Playlists & Series', folders));
        }
    }
}

function extractVideos(items) {
    let videos = [];
    items.forEach(item => {
        if (item.type === 'video') videos.push(item);
        else if (item.type === 'folder') videos = videos.concat(extractVideos(item.children));
    });
    return videos;
}

const thumbnailCache = new Map();
function generateThumbnail(videoUrl) {
    const authUrl = `${videoUrl}?token=${getToken()}`;
    if (thumbnailCache.has(authUrl)) return Promise.resolve(thumbnailCache.get(authUrl));
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.src = authUrl;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'metadata';
        
        video.onloadeddata = () => { video.currentTime = Math.min(5, video.duration / 2 || 0); };
        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 320; canvas.height = 180;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                thumbnailCache.set(authUrl, dataUrl);
                resolve(dataUrl);
            } catch(e) { resolve(null); }
        };
        video.onerror = () => resolve(null);
    });
}

let isHeroHovered = false;

function renderHeroPagination() {
    heroPagination.innerHTML = '';
    heroTrendingItems.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = 'dot' + (index === currentHeroIndex ? ' active' : '');
        dot.onclick = (e) => {
            e.stopPropagation(); // Prevent clicks from interfering
            clearInterval(heroAutoRotateInterval);
            setHeroIndex(index);
        };
        heroPagination.appendChild(dot);
    });
}

function startHeroAutoRotate() {
    clearInterval(heroAutoRotateInterval);
    heroAutoRotateInterval = setInterval(() => {
        let nextIndex = (currentHeroIndex + 1) % heroTrendingItems.length;
        setHeroIndex(nextIndex);
    }, 8000); // 8 seconds per slide
}

// Mute button logic
heroMuteBtn.onclick = () => {
    isHeroMuted = !isHeroMuted;
    heroVideoBg.muted = isHeroMuted;
    heroMuteBtn.innerHTML = isHeroMuted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
};

const heroPrevBtn = document.getElementById('hero-prev-btn');
const heroNextBtn = document.getElementById('hero-next-btn');

heroPrevBtn.onclick = (e) => {
    e.stopPropagation();
    clearInterval(heroAutoRotateInterval);
    if (heroTrendingItems.length > 0) {
        let prevIndex = (currentHeroIndex - 1 + heroTrendingItems.length) % heroTrendingItems.length;
        setHeroIndex(prevIndex);
    }
};

heroNextBtn.onclick = (e) => {
    e.stopPropagation();
    clearInterval(heroAutoRotateInterval);
    if (heroTrendingItems.length > 0) {
        let nextIndex = (currentHeroIndex + 1) % heroTrendingItems.length;
        setHeroIndex(nextIndex);
    }
};

function setHeroIndex(index) {
    if (index < 0 || index >= heroTrendingItems.length) return;
    currentHeroIndex = index;
    const video = heroTrendingItems[index];
    
    // Update dots
    document.querySelectorAll('.hero-pagination .dot').forEach((dot, idx) => {
        dot.className = 'dot' + (idx === currentHeroIndex ? ' active' : '');
    });
    
    heroTitle.textContent = video.name.replace(/\.[^/.]+$/, "");
    heroDescription.textContent = `Watch ${video.name} instantly. Featured Top 10 on Streamed today.`;
    
    // Reset video state
    heroBackground.style.display = 'block';
    heroVideoBg.style.display = 'none';
    heroVideoBg.pause();
    heroVideoBg.src = '';
    heroBackground.style.backgroundImage = 'none'; // Clear old background to avoid stuck look
    
    // Check if thumbnail is already cached for immediate update
    const authUrl = `${video.url}?token=${getToken()}`;
    if (thumbnailCache.has(authUrl)) {
        heroBackground.style.backgroundImage = `url(${thumbnailCache.get(authUrl)})`;
    } else {
        generateThumbnail(video.url).then(thumb => {
            if (thumb && currentHeroIndex === index) { // Ensure we are still on the same index
                heroBackground.style.backgroundImage = `url(${thumb})`;
            }
        });
    }

    heroPlayBtn.onclick = () => playVideo(video);
    
    const triggerHoverPreview = () => {
        clearInterval(heroAutoRotateInterval);
        clearTimeout(heroHoverTimeout);
        heroHoverTimeout = setTimeout(() => {
            heroVideoBg.src = `${video.url}?token=${getToken()}`;
            heroVideoBg.muted = isHeroMuted;
            heroVideoBg.style.display = 'block';
            heroVideoBg.play().catch(e => {
                // Auto-play blocked, force mute
                heroVideoBg.muted = true;
                isHeroMuted = true;
                heroMuteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                heroVideoBg.play().catch(err => console.log(err));
            });
        }, 800);
    };

    // If currently hovered (e.g. user clicked dot), trigger preview immediately for new video
    if (isHeroHovered) {
        triggerHoverPreview();
    }
    
    heroSection.onmouseenter = () => {
        isHeroHovered = true;
        triggerHoverPreview();
    };
    
    heroSection.onmouseleave = () => {
        isHeroHovered = false;
        clearTimeout(heroHoverTimeout);
        heroVideoBg.pause();
        heroVideoBg.style.display = 'none';
        heroVideoBg.src = '';
        startHeroAutoRotate(); // Resume rotation
    };

    startHeroAutoRotate();
}

function setupHoverPreview(element, videoObj) {
    let previewTimeout;
    element.addEventListener('mouseenter', () => {
        previewTimeout = setTimeout(() => {
            const videoEl = document.createElement('video');
            videoEl.className = 'card-video-preview';
            videoEl.src = `${videoObj.url}?token=${getToken()}`;
            videoEl.muted = true;
            videoEl.loop = true;
            videoEl.autoplay = true;
            element.appendChild(videoEl);
        }, 800);
    });
    
    element.addEventListener('mouseleave', () => {
        clearTimeout(previewTimeout);
        const videoEl = element.querySelector('.card-video-preview');
        if (videoEl) {
            videoEl.pause();
            videoEl.remove();
        }
    });
}

function createVideoRow(title, videos) {
    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `<h3>${title}</h3>`;
    
    const sliderContainer = document.createElement('div');
    sliderContainer.style.position = 'relative';

    const leftArrow = document.createElement('button');
    leftArrow.className = 'slider-arrow left';
    leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    
    const rightArrow = document.createElement('button');
    rightArrow.className = 'slider-arrow right';
    rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';

    const slider = document.createElement('div');
    slider.className = 'row-slider';

    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        setupHoverPreview(card, video);
        
        const history = watchHistory[video.path];
        let progressHtml = '';
        if (history && history.progress > 0 && history.duration > 0) {
            const percent = Math.min(100, (history.progress / history.duration) * 100);
            progressHtml = `<div class="watch-progress-bar" style="width: ${percent}%"></div>`;
        }

        const canManageVideos = localStorage.getItem(ROLE_KEY) === 'admin' || localStorage.getItem('streamhub_canManageVideos') === 'true';
        card.innerHTML = `
            <div class="thumbnail-wrapper">
                <i class="fa-solid fa-film thumbnail-placeholder"></i>
                ${progressHtml}
                ${canManageVideos ? `<button class="delete-video-btn" onclick="deleteVideo('${video.path.replace(/'/g, "\\'")}', event)" style="position:absolute; top:5px; right:5px; background:rgba(255,0,0,0.7); color:white; border:none; border-radius:3px; cursor:pointer; padding: 4px; z-index: 20;"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
            <div class="video-card-info">
                <div class="video-card-title" title="${video.name}">${video.name.replace(/\.[^/.]+$/, "").length > 28 ? video.name.replace(/\.[^/.]+$/, "").substring(0, 28) + '...' : video.name.replace(/\.[^/.]+$/, "")}</div>
            </div>
        `;

        card.addEventListener('click', () => playVideo(video));
        slider.appendChild(card);

        generateThumbnail(video.url).then(thumb => {
            if (thumb) {
                const wrap = card.querySelector('.thumbnail-wrapper');
                wrap.innerHTML = `<img src="${thumb}" alt="thumbnail">${progressHtml}`;
            }
        });
    });

    sliderContainer.appendChild(leftArrow);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(rightArrow);
    
    // Scroll logic
    leftArrow.onclick = () => {
        slider.scrollBy({ left: -slider.offsetWidth * 0.8, behavior: 'smooth' });
    };
    rightArrow.onclick = () => {
        slider.scrollBy({ left: slider.offsetWidth * 0.8, behavior: 'smooth' });
    };

    slider.addEventListener('scroll', () => {
        leftArrow.style.opacity = slider.scrollLeft > 0 ? '1' : '0';
        rightArrow.style.opacity = slider.scrollLeft >= (slider.scrollWidth - slider.clientWidth - 10) ? '0' : '1';
    });

    row.appendChild(sliderContainer);
    return row;
}

function createPlaylistRow(title, folders) {
    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `<h3>${title}</h3>`;
    
    const sliderContainer = document.createElement('div');
    sliderContainer.style.position = 'relative';

    const leftArrow = document.createElement('button');
    leftArrow.className = 'slider-arrow left';
    leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    
    const rightArrow = document.createElement('button');
    rightArrow.className = 'slider-arrow right';
    rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';

    const slider = document.createElement('div');
    slider.className = 'row-slider';

    folders.forEach(folder => {
        const card = document.createElement('div');
        card.className = 'video-card';
        if (folder.innerVideos && folder.innerVideos.length > 0) {
            setupHoverPreview(card, folder.innerVideos[0]);
        }
        
        card.innerHTML = `
            <div class="thumbnail-wrapper">
                <i class="fa-solid fa-folder-open thumbnail-placeholder"></i>
            </div>
            <div class="video-card-info">
                <div class="video-card-title" title="${folder.name}">${folder.name.length > 28 ? folder.name.substring(0, 28) + '...' : folder.name}</div>
            </div>
        `;

        card.addEventListener('click', () => openPlaylistModal(folder));
        slider.appendChild(card);

        if (folder.innerVideos && folder.innerVideos.length > 0) {
            generateThumbnail(folder.innerVideos[0].url).then(thumb => {
                if (thumb) {
                    const wrap = card.querySelector('.thumbnail-wrapper');
                    wrap.innerHTML = `<img src="${thumb}" alt="thumbnail">`;
                }
            });
        }
    });

    sliderContainer.appendChild(leftArrow);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(rightArrow);
    
    leftArrow.onclick = () => {
        slider.scrollBy({ left: -slider.offsetWidth * 0.8, behavior: 'smooth' });
    };
    rightArrow.onclick = () => {
        slider.scrollBy({ left: slider.offsetWidth * 0.8, behavior: 'smooth' });
    };

    slider.addEventListener('scroll', () => {
        leftArrow.style.opacity = slider.scrollLeft > 0 ? '1' : '0';
        rightArrow.style.opacity = slider.scrollLeft >= (slider.scrollWidth - slider.clientWidth - 10) ? '0' : '1';
    });

    row.appendChild(sliderContainer);
    return row;
}

function openPlaylistModal(folder) {
    const modalBg = document.getElementById('playlist-hero-bg');
    const titleEl = document.getElementById('playlist-title');
    const playBtn = document.getElementById('playlist-play-btn');
    const listEl = document.getElementById('playlist-episodes-list');

    titleEl.textContent = folder.name;
    listEl.innerHTML = '';

    if (folder.innerVideos && folder.innerVideos.length > 0) {
        const firstVideo = folder.innerVideos[0];
        
        setupHoverPreview(modalBg, firstVideo);

        generateThumbnail(firstVideo.url).then(thumb => {
            if (thumb) modalBg.style.backgroundImage = `url(${thumb})`;
        });

        playBtn.onclick = () => {
            closeModal('playlist-modal');
            playVideo(firstVideo);
        };

        folder.innerVideos.forEach((video, index) => {
            const history = watchHistory[video.path];
            let progressHtml = '';
            if (history && history.progress > 0 && history.duration > 0) {
                const percent = Math.min(100, (history.progress / history.duration) * 100);
                progressHtml = `<div class="watch-progress-bar" style="width: ${percent}%"></div>`;
            }

            const ep = document.createElement('div');
            ep.className = 'episode-item';
            setupHoverPreview(ep, video);
            
            ep.innerHTML = `
                <div style="display:flex; align-items:center; width: 30px; font-weight:bold; color: #888;">${index + 1}</div>
                <div class="episode-thumb-wrapper">
                    <i class="fa-solid fa-film" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#555;"></i>
                    ${progressHtml}
                </div>
                <div class="episode-info">
                    <div class="episode-title">${video.name.replace(/\.[^/.]+$/, "")}</div>
                </div>
            `;
            
            ep.addEventListener('click', () => {
                closeModal('playlist-modal');
                playVideo(video);
            });
            listEl.appendChild(ep);

            generateThumbnail(video.url).then(thumb => {
                if (thumb) {
                    const wrap = ep.querySelector('.episode-thumb-wrapper');
                    wrap.innerHTML = `<img src="${thumb}" alt="thumbnail">${progressHtml}`;
                }
            });
        });
    }

    openModal('playlist-modal');
}

function playVideo(fileItem) {
    const videoContainer = document.getElementById('video-container');
    const videoEl = document.getElementById('video-player');
    const currentVideoTitle = document.getElementById('current-video-title');
    const placeholder = document.getElementById('video-placeholder');
    const sidebar = document.getElementById('video-metadata-sidebar');
    const descriptionContainer = document.getElementById('video-description');
    const chaptersContainer = document.getElementById('video-chapters');
    const nextLessonBtn = document.getElementById('next-lesson-btn');
    
    // Clear Up Next overlay
    cancelUpNext();

    // Determine Context
    currentPlaylistContext = null;
    currentVideoIndex = -1;
    function findContext(files) {
        for (let f of files) {
            if (f.type === 'folder' && f.children) {
                const idx = f.children.findIndex(v => v.path === fileItem.path);
                if (idx !== -1) {
                    currentPlaylistContext = f.children;
                    currentVideoIndex = idx;
                    return true;
                }
                if (findContext(f.children)) return true;
            }
        }
        return false;
    }
    findContext(globalFiles);

    if (currentPlaylistContext && currentVideoIndex >= 0 && currentVideoIndex < currentPlaylistContext.length - 1) {
        nextLessonBtn.style.display = 'flex';
    } else {
        nextLessonBtn.style.display = 'none';
    }

    if (!fileItem) {
        videoEl.style.display = 'none';
        placeholder.style.display = 'flex';
        return;
    }

    videoContainer.style.display = 'flex';
    videoEl.style.display = 'block';
    placeholder.style.display = 'none';
    
    sidebar.style.display = 'none';
    descriptionContainer.style.display = 'none';
    chaptersContainer.style.display = 'none';
    
    videoEl.src = fileItem.url + `?token=${getToken()}`;
    videoEl.play();

    // Setup Next Lesson onended
    videoEl.onended = () => {
        if (currentPlaylistContext && currentVideoIndex >= 0 && currentVideoIndex < currentPlaylistContext.length - 1) {
            const nextVideo = currentPlaylistContext[currentVideoIndex + 1];
            showUpNextOverlay(nextVideo);
        }
    };

    let lastProgress = 0;
    videoEl.ontimeupdate = () => {
        const current = videoEl.currentTime;
        const duration = videoEl.duration;
        if (current - lastProgress > 5 && duration > 0) {
            lastProgress = current;
            fetch('/api/history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    path: fileItem.path,
                    progress: current,
                    duration: duration
                })
            });
        }
    };

    if (fileItem.descriptionUrl) {
        fetch(fileItem.descriptionUrl + `?token=${getToken()}`)
            .then(res => res.text())
            .then(text => {
                if (text && text.trim()) {
                    descriptionContainer.style.display = 'block';
                    descriptionContainer.innerHTML = `<h4>Description</h4><div>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
                    sidebar.style.display = 'flex';
                }
            }).catch(e => console.error(e));
    }

    currentVideoTitle.textContent = fileItem.name.replace(/\.[^/.]+$/, "");
}

function showUpNextOverlay(nextVideo) {
    const overlay = document.getElementById('up-next-overlay');
    const titleEl = document.getElementById('up-next-title');
    const countdownEl = document.getElementById('up-next-countdown');
    
    titleEl.textContent = nextVideo.name.replace(/\.[^/.]+$/, "");
    overlay.style.display = 'flex';
    
    let secondsLeft = 5;
    countdownEl.textContent = secondsLeft;
    
    upNextTimeout = setInterval(() => {
        secondsLeft--;
        countdownEl.textContent = secondsLeft;
        if (secondsLeft <= 0) {
            clearInterval(upNextTimeout);
            playNextLesson();
        }
    }, 1000);
}

function cancelUpNext() {
    if (upNextTimeout) {
        clearInterval(upNextTimeout);
        upNextTimeout = null;
    }
    const overlay = document.getElementById('up-next-overlay');
    if (overlay) overlay.style.display = 'none';
}

function playNextLesson() {
    if (currentPlaylistContext && currentVideoIndex >= 0 && currentVideoIndex < currentPlaylistContext.length - 1) {
        cancelUpNext();
        playVideo(currentPlaylistContext[currentVideoIndex + 1]);
    }
}

// Form Handlers
document.getElementById('folder-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const path = document.getElementById('folder-path').value;
    const name = document.getElementById('folder-name').value;
    try {
        const res = await apiFetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name })
        });
        if (res.ok) {
            showToast('Folder created successfully');
            closeModal('folder-modal');
        } else {
            const data = await res.json();
            showToast(data.error, 'error');
        }
    } catch (err) {}
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectVal = document.getElementById('upload-path-select').value;
    const newPathVal = document.getElementById('upload-path-new').value;
    const path = selectVal === 'NEW_FOLDER_OPTION' ? newPathVal : selectVal;
    
    const files = document.getElementById('upload-file').files;
    
    const formData = new FormData();
    formData.append('folder', path);
    for (let i = 0; i < files.length; i++) {
        formData.append('video', files[i]);
    }
    
    const btn = document.getElementById('upload-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Uploading...';
    btn.disabled = true;

    const progressContainer = document.getElementById('upload-progress-container');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressText = document.getElementById('upload-progress-text');
    progressContainer.style.display = 'block';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }
    };

    xhr.onload = function() {
        btn.textContent = originalText;
        btn.disabled = false;
        if (xhr.status === 200) {
            showToast('Video uploaded successfully');
            closeModal('add-video-modal');
        } else {
            showToast('Error uploading file', 'error');
        }
    };
    xhr.send(formData);
});

document.getElementById('ytdlp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('ytdlp-url').value;
    const selectVal = document.getElementById('ytdlp-path-select').value;
    const newPathVal = document.getElementById('ytdlp-path-new').value;
    const folder = selectVal === 'NEW_FOLDER_OPTION' ? newPathVal : selectVal;
    try {
        const res = await apiFetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, folder })
        });
        if (res.ok) {
            showToast('Download started!');
            closeModal('add-video-modal');
        }
    } catch (err) {}
});

// SSE Events
let eventSource = null;
function initSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/events?token=${getToken()}`);
    
    const activeTasksContainer = document.getElementById('active-tasks');
    const tasksContainer = document.getElementById('tasks-container');
    const tasksMap = new Map();

    eventSource.addEventListener('refresh', () => fetchFiles());

    eventSource.addEventListener('download-start', (e) => {
        const data = JSON.parse(e.data);
        activeTasksContainer.style.display = 'block';
        const taskEl = document.createElement('div');
        taskEl.innerHTML = `<div style="font-size:0.85rem">Downloading...</div><div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>`;
        tasksContainer.appendChild(taskEl);
        tasksMap.set(data.id, taskEl);
    });

    eventSource.addEventListener('download-progress', (e) => {
        const data = JSON.parse(e.data);
        const taskEl = tasksMap.get(data.id);
        if (taskEl) taskEl.querySelector('.progress-fill').style.width = `${data.progress}%`;
    });

    eventSource.addEventListener('download-complete', (e) => {
        const data = JSON.parse(e.data);
        const taskEl = tasksMap.get(data.id);
        if (taskEl) {
            taskEl.querySelector('.progress-fill').style.width = '100%';
            setTimeout(() => {
                taskEl.remove();
                tasksMap.delete(data.id);
                if (tasksMap.size === 0) activeTasksContainer.style.display = 'none';
                showToast('Download Complete!');
            }, 2000);
        }
    });
}

async function shutdownServer() {
    if(!confirm('Are you sure you want to shutdown the server?')) return;
    try {
        const res = await apiFetch('/api/shutdown', { method: 'POST' });
        if (res.ok) {
            showToast('Server is shutting down...');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
    } catch(e) {
        showToast('Failed to shutdown server', 'error');
    }
}

async function deleteVideo(path, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this video?')) return;
    try {
        const res = await apiFetch('/api/video', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoPath: path })
        });
        if (res.ok) {
            showToast('Video deleted');
            fetchFiles().then(() => {
            checkUrlParamsForShare();
        });
        } else {
            const data = await res.json();
            showToast(data.error, 'error');
        }
    } catch(e) {}
}

function checkUrlParamsForShare() {
    const params = new URLSearchParams(window.location.search);
    const videoUrl = params.get('video');
    const playlistName = params.get('playlist');

    if (videoUrl) {
        const found = findVideoByUrl(currentFiles, videoUrl);
        if (found) {
            playVideo(found);
        } else {
            playVideo({ url: videoUrl, name: decodeURIComponent(videoUrl.split('/').pop()) });
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (playlistName) {
        const found = findPlaylistByName(currentFiles, playlistName);
        if (found) {
            openPlaylistModal(found);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function findVideoByUrl(files, url) {
    for (let f of files) {
        if (f.type === 'video' && f.url === url) return f;
        if (f.type === 'folder' && f.children) {
            let found = findVideoByUrl(f.children, url);
            if (found) return found;
        }
    }
    return null;
}

function findPlaylistByName(files, name) {
    for (let f of files) {
        if (f.type === 'folder' && f.name === name) return f;
    }
    return null;
}

// View Mode
const VIEW_MODE_KEY = 'streamhub_view_mode';
function initViewMode() {
    const savedMode = localStorage.getItem(VIEW_MODE_KEY) || 'grid';
    const select = document.getElementById('view-mode-select');
    if (select) select.value = savedMode;
    changeViewMode(savedMode);
}

window.changeViewMode = function(mode) {
    localStorage.setItem(VIEW_MODE_KEY, mode);
    catalogContainer.className = 'catalog-container'; // reset
    if (mode !== 'default') {
        catalogContainer.classList.add(`view-${mode}`);
    }
};

window.copyShareLink = function(url, event) {
    if (event) event.stopPropagation();
    
    let fullUrl = "";
    if (url.startsWith('/?playlist=')) {
        fullUrl = window.location.origin + url;
    } else {
        fullUrl = window.location.origin + '/?video=' + encodeURIComponent(url);
    }
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(fullUrl).then(() => {
            showToast('Link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(fullUrl);
        });
    } else {
        fallbackCopyTextToClipboard(fullUrl);
    }
};

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        var successful = document.execCommand('copy');
        if (successful) showToast('Link copied to clipboard!');
        else showToast('Failed to copy', 'error');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
}

// Start
initViewMode();
checkAuth();
