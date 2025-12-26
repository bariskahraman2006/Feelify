
document.addEventListener('DOMContentLoaded', async () => {
    
    
    await loadUserProfile();
    await loadSavedPlaylists();
    
    if (document.getElementById('stats-content')) {
        await loadStats();
    }

   
    const generateBtn = document.getElementById('generate-button');
    const cameraBtn = document.getElementById('camera-button');
    const goBackBtn = document.getElementById('go-back-button');
    const captureBtn = document.getElementById('capture-mood-button');

    if (generateBtn) generateBtn.addEventListener('click', generateMelody);
    
  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
        console.log("Camera opened - Hiding button"); 
        initCamera();
        
        
        document.getElementById('prompt-input-wrapper').style.display = 'none';
        
        
        const genBtn = document.getElementById('generate-button');
        if (genBtn) {
            genBtn.style.setProperty('display', 'none', 'important');
        }
        
       
        document.getElementById('camera-feed-container').style.display = 'flex';
    });
}

if (goBackBtn) {
    goBackBtn.addEventListener('click', () => {
        stopCamera();
        
       
        document.getElementById('camera-feed-container').style.display = 'none';
        
        
        document.getElementById('prompt-input-wrapper').style.display = 'flex';
        
       
        const genBtn = document.getElementById('generate-button');
        genBtn.style.display = 'block';  
        genBtn.style.margin = '20px auto 0 auto';  
    });
}
    
    if (captureBtn) captureBtn.addEventListener('click', captureMoodWithAI);

    
    setupModal();

    
    loadAIModels(); 
});


function setupModal() {
    const modal = document.getElementById("support-modal");
    const closeBtn = document.querySelector(".close-modal");
    const supportForm = document.getElementById("support-form");
    
    
    const helpBtns = document.querySelectorAll("#help-btn, #help-btn-stats");

    
    helpBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) modal.style.display = "flex";
        });
    });

    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.style.display = "none";
        });
    }

    
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target == modal) modal.style.display = "none";
        });
    }

    
    if (supportForm) {
        supportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = document.getElementById("support-msg").value;
            const email = document.getElementById("user-email").value;
            const sendBtn = document.querySelector('.modal-send-btn');
            
            if(message.length < 5) {
                alert("Please describe your issue.");
                return;
            }

            sendBtn.innerHTML = 'Sending...';
            sendBtn.disabled = true;

            try {
                const res = await fetch('/api/send-support', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ userEmail: email, message: message })
                });

                const data = await res.json();

                if(data.success) {
                    sendBtn.innerHTML = 'Sent!';
                    sendBtn.style.backgroundColor = '#1ed760';
                    setTimeout(() => {
                        modal.style.display = "none";
                        document.getElementById("support-msg").value = ""; 
                        sendBtn.innerText = "Send Message";
                        sendBtn.style.backgroundColor = "";
                        sendBtn.disabled = false;
                    }, 1500);
                } else {
                    alert("Error: " + data.error);
                    sendBtn.innerText = "Try Again";
                    sendBtn.disabled = false;
                }
            } catch (err) {
                console.error(err);
                alert("Connection failed.");
                sendBtn.innerText = "Try Again";
                sendBtn.disabled = false;
            }
        });
    }
}



async function loadSavedPlaylists() {
    const lists = document.querySelectorAll('#saved-playlists');
    if (lists.length === 0) return;

    lists.forEach(l => l.innerHTML = '<li style="padding:15px; color:#b3b3b3; font-size:12px;">Connecting to Spotify...</li>');

    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();

        lists.forEach(list => {
            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<li style="padding:15px; color:#777; font-size:12px;">No playlists found.</li>';
                return;
            }
            data.forEach(pl => {
                const imgUrl = pl.images && pl.images.length > 0 ? pl.images[0].url : null;
                const imgHtml = imgUrl 
                    ? `<img src="${imgUrl}" class="playlist-cover" style="width:50px; height:50px; border-radius:6px; object-fit:cover; margin-right:15px;">` 
                    : `<div class="playlist-cover placeholder" style="width:50px; height:50px; background:#333; border-radius:6px; margin-right:15px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-music"></i></div>`;

                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="${pl.external_urls.spotify}" target="_blank" class="playlist-item" style="display:flex; align-items:center; text-decoration:none; color:#b3b3b3; margin-bottom:10px; padding:8px; border-radius:8px; transition:0.2s;">
                        ${imgHtml}
                        <div class="playlist-info" style="overflow:hidden;">
                            <span class="playlist-name" style="font-size:14px; font-weight:700; color:white; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pl.name}</span>
                            <span class="playlist-count" style="font-size:11px; color:#666;">${pl.tracks.total} Songs</span>
                        </div>
                    </a>`;
                
                const link = li.querySelector('a');
                link.onmouseover = function() { this.style.backgroundColor = 'rgba(255,255,255,0.1)'; this.style.color = 'white'; };
                link.onmouseout = function() { this.style.backgroundColor = 'transparent'; this.style.color = '#b3b3b3'; };
                list.appendChild(li);
            });
        });
    } catch(e) { lists.forEach(l => l.innerHTML = '<li style="color:red;">Error loading lists.</li>'); }
}

async function loadUserProfile() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        document.querySelectorAll('#user-name').forEach(el => el.innerText = data.username || 'User');
        const emailInput = document.getElementById('user-email');
        if (emailInput) emailInput.value = data.email || "Email not available";
        if (data.image) {
            document.querySelectorAll('#user-avatar').forEach(img => { img.src = data.image; img.style.display = 'block'; });
            document.querySelectorAll('#user-avatar-placeholder').forEach(el => el.style.display = 'none');
        }
    } catch(e) { console.log(e); }
}

async function loadStats() {
    const loadingEl = document.getElementById('loading-stats');
    const contentEl = document.getElementById('stats-content');
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.error) { if(loadingEl) loadingEl.innerHTML = `<p style="color:red">${data.error}</p>`; return; }

        const tracksList = document.getElementById('tracks-list');
        if(tracksList && data.tracks) {
            tracksList.innerHTML = '';
            data.tracks.forEach((t,i) => {
                 tracksList.innerHTML += `<a href="${t.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${t.album.images[0].url}" style="width:45px; height:45px; border-radius:5px; margin-right:12px;"><div class="info"><span class="title" style="color:white; font-weight:bold;">${t.name}</span><span class="artist" style="color:#b3b3b3; font-size:12px;">${t.artists[0].name}</span></div></a>`;
            });
        }
        
        const artistsList = document.getElementById('artists-list');
        if(artistsList && data.artists) {
             artistsList.innerHTML = '';
             data.artists.forEach((a,i) => {
                 artistsList.innerHTML += `<a href="${a.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${a.images[0].url}" style="width:45px; height:45px; border-radius:50%; margin-right:12px;"><div class="info"><span class="title" style="color:white; font-weight:bold;">${a.name}</span></div></a>`;
             });
        }
        if(loadingEl) loadingEl.style.display = 'none';
        if(contentEl) contentEl.style.display = 'flex';
    } catch(e) { console.log(e); }
}

async function generateMelody() {
    const input = document.getElementById('mood-prompt');
    const resultDiv = document.getElementById('playlist-results');
    const btn = document.getElementById('generate-button');
    if (input.value.length < 3) { alert("Please write something!"); return; }
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    resultDiv.innerHTML = '<div class="placeholder-card"><p>AI is analyzing...</p></div>';
    try {
        const res = await fetch('/api/generate-melody', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ feeling_text: input.value })
        });
        const data = await res.json();
        if (data.success) {
            resultDiv.innerHTML = `
                <div class="placeholder-card" style="border: 2px solid #1DB954; text-align: center; padding: 30px; display:flex; flex-direction:column; align-items:center;">
                    <div style="font-size: 40px; color: #1DB954; margin-bottom: 10px;"><i class="fas fa-check-circle"></i></div>
                    <h3 style="margin-bottom:10px; color:white;">Playlist Ready!</h3>
                    <p style="margin-bottom:20px; color:#b3b3b3;">Mood: <strong style="color:#1ed760;">${data.mood}</strong></p>
                    <a href="${data.playlist_url}" target="_blank" class="spotify-button" style="display:inline-block; background:#1DB954; color:black; padding:12px 30px; border-radius:50px; text-decoration:none; font-weight:bold; font-size:16px; transition:0.2s;">Open in Spotify</a>
                </div>`;
            setTimeout(loadSavedPlaylists, 2000);
        } else { resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`; }
    } catch (e) { resultDiv.innerHTML = `<p style="color:red">Connection error.</p>`; } 
    finally { btn.disabled = false; btn.innerHTML = 'GENERATE MY MELODY'; }
}

async function loadAIModels() {
    if (typeof faceapi === 'undefined') return;
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    } catch (e) { console.error(e); }
}

let stream;
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        document.getElementById('video-feed').srcObject = stream;
    } catch(e) { alert("Permission denied"); }
}
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); }
async function captureMoodWithAI() {
    const video = document.getElementById('video-feed');
    const input = document.getElementById('mood-prompt');
    const container = document.getElementById('camera-feed-container');
    const overlay = document.createElement('div');
    overlay.innerHTML = `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:#1ed760; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999;"><i class="fas fa-brain fa-3x fa-spin"></i><h3>ANALYZING...</h3></div>`;
    container.appendChild(overlay);
    try {
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        setTimeout(() => {
            if (detections) {
                const expressions = detections.expressions;
                let maxEmotion = 'neutral'; let maxValue = 0;
                for (const [emotion, value] of Object.entries(expressions)) {
                    if (value > maxValue) { maxValue = value; maxEmotion = emotion; }
                }
                let aiText = `Detected: ${maxEmotion.toUpperCase()}.`;
                if(maxEmotion === 'happy') aiText = "Detected Happiness! Upbeat vibes.";
                else if(maxEmotion === 'sad') aiText = "Detected Sadness. Acoustic vibes.";
                input.value = aiText + ` (${Math.round(maxValue*100)}%)`;
            } else { input.value = "Face not detected."; }
            stopCamera(); overlay.remove(); container.style.display = 'none';
            stopCamera(); 
overlay.remove(); 
container.style.display = 'none';

document.getElementById('prompt-input-wrapper').style.display = 'flex';
            document.getElementById('prompt-input-wrapper').style.display = 'flex';
        }, 1000);
        
const genBtn = document.getElementById('generate-button');
genBtn.style.display = 'block';
genBtn.style.margin = '20px auto 0 auto';
    } catch(e) { stopCamera(); overlay.remove(); alert("AI Error"); }
}