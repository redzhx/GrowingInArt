// === Helper Functions ===
function formatDate(dateStr) {
  const parts = dateStr.split('-');
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
}

function formatAge(age) {
  const years = Math.floor(age);
  const months = Math.round((age - years) * 12);
  if (months === 0) return `${years}岁`;
  return `${years}岁${months}个月`;
}

// === Gallery Rendering ===
function renderGallery(containerId, items, storeKey) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const key = storeKey || containerId;
  window['_gallery_' + key] = items;

  container.innerHTML = items.map(item => `
    <div class="artwork-card" onclick="viewArtwork('${item.id}')">
      <img src="${item.thumb}" alt="${item.title}" loading="lazy">
      <div class="card-info">
        <div class="title">${item.title}</div>
        <div class="meta">
          <span class="child-dot" style="background:${item.child === 'yifei' ? 'var(--yifei)' : 'var(--yicheng)'}"></span>
          ${formatDate(item.date)}
          <span style="margin-left:auto">${formatAge(item.age)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function viewArtwork(id) {
  window.location.href = '/artwork?id=' + encodeURIComponent(id);
}

// === Lightbox (for gallery pages) ===
let lightboxItems = [];
let lightboxIndex = 0;

function openLightbox(galleryKey, index) {
  lightboxItems = window['_gallery_' + galleryKey] || [];
  lightboxIndex = index;
  const item = lightboxItems[index];
  if (!item) return;
  document.getElementById('lightbox-img').src = item.full;
  document.getElementById('lightbox-info').textContent = item.title + ' · ' + formatDate(item.date) + ' · ' + formatAge(item.age);
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function navigateLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  document.getElementById('lightbox-img').src = item.full;
  document.getElementById('lightbox-info').textContent = item.title + ' · ' + formatDate(item.date) + ' · ' + formatAge(item.age);
}

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb || !lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});

// Also close lightbox when clicking on background
document.addEventListener('click', e => {
  const lb = document.getElementById('lightbox');
  if (e.target === lb) closeLightbox();
});

// === Filter Buttons ===
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const parent = this.parentElement;
      parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const filter = this.textContent;
      // Find which gallery is on this page
      const gallery = document.querySelector('.gallery');
      if (!gallery) return;

      // Get items for this gallery
      const key = Object.keys(window).find(k => k.startsWith('_gallery_'));
      if (!key) return;
      const allItems = window[key];

      let filtered;
      if (filter === '全部作品') {
        filtered = allItems;
      } else if (filter.includes('-')) {
        const [start, end] = filter.split('-');
        filtered = allItems.filter(a => {
          const year = parseInt(a.date.substring(0, 4));
          return year >= parseInt(start) && year <= parseInt('20' + end);
        });
      }

      if (filtered) {
        gallery.innerHTML = '';
        const newKey = key.replace('_gallery_', '');
        renderGallery(gallery.id, filtered, newKey);
      }
    });
  });
});

// === Nav scroll effect ===
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (nav) {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
});
