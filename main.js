/* reveal on scroll */
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

/* duplicate marquee for seamless loop */
const track = document.querySelector('.marquee__track');
if (track) track.innerHTML = track.innerHTML + track.innerHTML;

/* nav background on scroll */
const nav = document.querySelector('.nav');
addEventListener('scroll', () => {
  if (scrollY > 40) nav.style.backdropFilter = 'blur(10px)';
  else nav.style.backdropFilter = 'none';
});
document.body.style.background = 'var(--bg)';

/* double click on logo (Anish✳) opens admin login page */
document.addEventListener('dblclick', e => {
  if (e.target.closest('.nav__logo')) {
    e.preventDefault();
    window.location.href = '/login';
  }
});

/* social media & project galleries */
const gallery = document.getElementById('gallery');
let activeFolder = 'social-media';
let SM_IMAGES = [];
const IS_VIDEO_RE = /\.(mp4|webm|mov)$/i;

/* auto-scan project folders */
const loadGalleryImages = (folder = activeFolder) =>
  fetch('/api/images?folder=' + encodeURIComponent(folder), { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('no api');
      return r.json();
    })
    .then(d => {
      if (d && Array.isArray(d.images)) SM_IMAGES = d.images;
    })
    .catch(() => {});

// Fetch default gallery images on initial page load
loadGalleryImages();

if (gallery) {
  const stage = document.getElementById('gallery-stage');
  if (stage) {
    stage.classList.add('has-strip');
    const canvas = document.getElementById('fx-canvas');
    if (canvas) canvas.remove();
  }

  const buildStrip = () => {
    if (!stage || stage.querySelector('.gallery__strip')) return;
    const strip = document.createElement('div');
    strip.className = 'gallery__strip';
    if (!SM_IMAGES.length) return;

    for (let copy = 0; copy < 3; copy++) {
      SM_IMAGES.forEach((src, i) => {
        const a = document.createElement('a');
        a.className = 'gallery__item';
        a.href = '#';
        a.dataset.index = i;
        a.setAttribute('aria-label', 'View media ' + (i + 1));
        const mediaUrl = encodeURIComponent(activeFolder) + '/' + src.split('/').map(encodeURIComponent).join('/');
        const isVid = IS_VIDEO_RE.test(src);

        if (isVid) {
          const video = document.createElement('video');
          video.src = mediaUrl;
          video.autoplay = true;
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          const applyVidAspect = () => {
            if (video.videoWidth && video.videoHeight) {
              const aspect = video.videoWidth / video.videoHeight;
              a.style.width = 'calc(70vh * ' + aspect + ')';
            }
          };
          video.addEventListener('loadedmetadata', applyVidAspect);
          video.addEventListener('canplay', applyVidAspect);

          // Unmute video sound on hover, mute on mouseleave
          a.addEventListener('mouseenter', () => {
            video.muted = false;
            video.volume = 1.0;
            video.play().catch(() => {});
          });
          a.addEventListener('mouseleave', () => {
            video.muted = true;
          });

          a.appendChild(video);
        } else {
          const img = document.createElement('img');
          img.alt = activeFolder + ' media ' + (i + 1);
          img.src = mediaUrl;
          const applyImgAspect = () => {
            if (img.naturalWidth && img.naturalHeight) {
              const aspect = img.naturalWidth / img.naturalHeight;
              a.style.width = 'calc(70vh * ' + aspect + ')';
            }
          };
          if (img.complete) applyImgAspect();
          else img.addEventListener('load', applyImgAspect);
          a.appendChild(img);
        }

        a.addEventListener('click', e => {
          e.preventDefault();
          if (Math.abs(dragDX) > 6) return;
          window.openLightbox(parseInt(a.dataset.index, 10));
        });
        strip.appendChild(a);
      });
    }
    stage.appendChild(strip);
    initStripScroll(strip);
  };

  const reloadGallery = (force = false) => {
    return loadGalleryImages(activeFolder).then(() => {
      if (stage) {
        const hint = stage.querySelector('.gallery__hint');
        if (hint) hint.textContent = SM_IMAGES.length + ' items';
      }
      if (gallery.classList.contains('open')) {
        const old = stage?.querySelector('.gallery__strip');
        if (!old || force) {
          if (old) old.remove();
          buildStrip();
        }
      }
      if (typeof window.updateLightboxIfOpen === 'function') {
        window.updateLightboxIfOpen();
      }
    });
  };

  const openGallery = (folder = 'social-media', title = '') => {
    const isFolderChanged = activeFolder !== folder;
    activeFolder = folder;
    const chromeTitle = document.querySelector('.chrome__title');
    if (chromeTitle) {
      chromeTitle.textContent = title ? title.toUpperCase() : activeFolder.toUpperCase() + ' — GALLERY';
    }
    gallery.classList.add('open');
    gallery.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    reloadGallery(isFolderChanged || !stage?.querySelector('.gallery__strip'));
  };

  const closeGallery = () => {
    if (gallery) {
      gallery.querySelectorAll('video').forEach(v => { v.muted = true; });
    }
    gallery.classList.remove('open');
    gallery.setAttribute('aria-hidden', 'true');
    if (!lightbox || !lightbox.classList.contains('open')) document.body.style.overflow = '';
  };

  let dragDX = 0;

  const initStripScroll = strip => {
    const cards = Array.from(strip.querySelectorAll('.gallery__item'));
    const COUNT = SM_IMAGES.length;
    if (!COUNT) return;

    let singleSetWidth = 0;
    let cardCentersInStrip = [];
    let currentX = 0;
    let targetX = 0;

    const calcWidths = () => {
      let sum = 0;
      const gap = parseFloat(getComputedStyle(strip).columnGap) || 34;
      cardCentersInStrip = [];
      let currentOffset = 0;

      cards.forEach((card, idx) => {
        const w = card.offsetWidth || 240;
        cardCentersInStrip[idx] = currentOffset + w / 2;
        currentOffset += w + gap;
        if (idx < COUNT) {
          sum += w + gap;
        }
      });
      if (sum > 50) {
        singleSetWidth = sum;
        if (currentX === 0) {
          currentX = targetX = singleSetWidth;
        }
      }
    };

    calcWidths();
    strip.querySelectorAll('img, video').forEach(media => {
      if (media.tagName === 'IMG') {
        if (media.complete) calcWidths();
        else media.addEventListener('load', calcWidths);
      } else if (media.tagName === 'VIDEO') {
        media.addEventListener('loadedmetadata', calcWidths);
      }
    });

    window.addEventListener('resize', calcWidths);

    let velocity = 0;
    let isDragging = false;
    let lastClientX = 0;

    const tick = () => {
      if (!strip.isConnected) return;

      if (!singleSetWidth || singleSetWidth < 100) {
        calcWidths();
      }

      if (isDragging) {
        currentX += (targetX - currentX) * 0.25;
      } else {
        targetX += velocity;
        velocity *= 0.92;
        if (Math.abs(velocity) < 0.02) velocity = 0;
        currentX += (targetX - currentX) * 0.12;
      }

      if (singleSetWidth > 0) {
        while (currentX < singleSetWidth) {
          currentX += singleSetWidth;
          targetX += singleSetWidth;
        }
        while (currentX >= singleSetWidth * 2) {
          currentX -= singleSetWidth;
          targetX -= singleSetWidth;
        }
      }

      strip.style.transform = 'translateX(' + (-currentX) + 'px)';

      const stageCenter = (stage ? stage.offsetWidth : window.innerWidth) / 2;

      cards.forEach((card, idx) => {
        const centerInStrip = cardCentersInStrip[idx];
        if (centerInStrip === undefined) return;

        const cardCenterInStageDist = centerInStrip - currentX;
        const dist = cardCenterInStageDist / stageCenter;
        const clampedDist = Math.max(-1.5, Math.min(1.5, dist));

        const rotateY = Math.max(-28, Math.min(28, clampedDist * -14));
        const translateZ = Math.max(-220, -Math.pow(Math.abs(clampedDist), 2) * 75);
        card.style.transform = 'rotateY(' + rotateY + 'deg) translateZ(' + translateZ + 'px)';
      });

      requestAnimationFrame(tick);
    };

    strip.addEventListener('pointerdown', e => {
      isDragging = true;
      lastClientX = e.clientX;
      velocity = 0;
      dragDX = 0;
      try { strip.setPointerCapture(e.pointerId); } catch (_) {}
    });

    strip.addEventListener('pointermove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastClientX;
      lastClientX = e.clientX;
      targetX -= dx;
      velocity = -dx;
      dragDX += Math.abs(dx);
    });

    const endDrag = e => {
      if (isDragging) {
        isDragging = false;
        try { strip.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);

    strip.addEventListener('wheel', e => {
      if (!gallery.classList.contains('open')) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      velocity += delta * 0.35;
    }, { passive: false });

    requestAnimationFrame(tick);
  };

  // Bind click handlers to all work items on page
  document.querySelectorAll('.work-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const folder = item.dataset.folder || 'social-media';
      const title = item.dataset.title || item.querySelector('.title')?.textContent || folder;
      openGallery(folder, title);
    });
  });

  gallery.addEventListener('click', e => {
    if (e.target === gallery || e.target.closest('.gallery__close')) closeGallery();
  });
  document.addEventListener('keydown', e => {
    if (!gallery.classList.contains('open')) return;
    if (e.key === 'Escape') closeGallery();
  });

  // Real-time update listeners across tabs and auto-polling
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('portfolio_gallery') : null;
  if (bc) {
    bc.onmessage = e => {
      if (e.data) {
        if (e.data.type === 'IMAGES_UPDATED') reloadGallery(true);
        if (e.data.type === 'CONTENT_UPDATED') loadSiteContent();
      }
    };
  }
  window.addEventListener('storage', e => {
    if (e.key === 'portfolio_gallery_updated') reloadGallery(true);
    if (e.key === 'portfolio_content_updated') loadSiteContent();
  });
  window.addEventListener('focus', () => { reloadGallery(false); loadSiteContent(); });
  setInterval(() => reloadGallery(false), 4000);
}

/* lightbox: fullscreen viewer with prev/next + swipe */
const lightbox = document.getElementById('lightbox');
if (lightbox && gallery) {
  const lbImg = lightbox.querySelector('.lightbox__img');
  const lbCount = lightbox.querySelector('.lightbox__count');
  let lbIndex = 0;

  const showLightbox = i => {
    if (!SM_IMAGES.length) return;
    lbIndex = (i + SM_IMAGES.length) % SM_IMAGES.length;
    const file = SM_IMAGES[lbIndex];
    const isVid = IS_VIDEO_RE.test(file);
    const mediaUrl = encodeURIComponent(activeFolder) + '/' + file;

    let lbVid = lightbox.querySelector('.lightbox__video');

    if (isVid) {
      lbImg.style.display = 'none';
      if (!lbVid) {
        lbVid = document.createElement('video');
        lbVid.className = 'lightbox__video';
        lbImg.parentNode.insertBefore(lbVid, lbImg);
      }
      lbVid.style.display = 'block';
      lbVid.src = mediaUrl;
      lbVid.controls = true;
      lbVid.autoplay = true;
      lbVid.loop = true;
      lbVid.playsInline = true;
    } else {
      if (lbVid) {
        lbVid.pause();
        lbVid.style.display = 'none';
      }
      lbImg.style.display = 'block';
      lbImg.src = mediaUrl;
      lbImg.style.animation = 'none';
      void lbImg.offsetWidth;
      lbImg.style.animation = '';
    }

    lbCount.textContent = (lbIndex + 1) + ' / ' + SM_IMAGES.length;
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  window.openLightbox = showLightbox;

  window.updateLightboxIfOpen = () => {
    if (!lightbox.classList.contains('open')) return;
    if (!SM_IMAGES.length) {
      closeLightbox();
      return;
    }
    if (lbIndex >= SM_IMAGES.length) lbIndex = SM_IMAGES.length - 1;
    showLightbox(lbIndex);
  };

  const closeLightbox = () => {
    const lbVid = lightbox.querySelector('.lightbox__video');
    if (lbVid) { lbVid.pause(); lbVid.style.display = 'none'; }
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    if (!gallery.classList.contains('open')) document.body.style.overflow = '';
  };
  const nextImg = () => showLightbox(lbIndex + 1);
  const prevImg = () => showLightbox(lbIndex - 1);

  lightbox.querySelector('.lightbox__nav--next').addEventListener('click', nextImg);
  lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', prevImg);
  lightbox.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') nextImg();
    else if (e.key === 'ArrowLeft') prevImg();
  });

  let touchX = null;
  lightbox.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (dx > 40) nextImg();
    else if (dx < -40) prevImg();
  }, { passive: true });
}

/* Dynamic Site Content Engine */
const applySiteContent = data => {
  if (!data || typeof data !== 'object') return;

  // Hero section
  const availEl = document.querySelector('.hero__avail');
  if (availEl && data.heroAvail) {
    availEl.innerHTML = data.heroAvail + ' <span class="dot"></span>';
  }

  const navLogo = document.querySelector('.nav__logo');
  if (navLogo && data.firstName) {
    navLogo.innerHTML = data.firstName + '<em>✳</em>';
  }

  const heroName = document.querySelector('.hero__name');
  if (heroName && data.firstName && data.lastName) {
    const makeRow = (str, sup) => {
      let h = '<span class="row"><span>';
      for (const ch of str) h += '<span class="ch">' + ch + '</span>';
      if (sup) h += '<sup>' + sup + '</sup>';
      h += '</span></span>';
      return h;
    };
    heroName.innerHTML = makeRow(data.firstName, '') + makeRow(data.lastName, '&reg;');
    initNameSpotlight();
  }

  const roleEl = document.querySelector('.hero__role');
  if (roleEl && (data.heroRolePrefix || data.heroRoleSuffix)) {
    roleEl.innerHTML = '<b>' + (data.heroRolePrefix || '') + '</b> ' + (data.heroRoleSuffix || '');
  }

  // Social Links
  if (data.instagramUrl) {
    document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = data.instagramUrl);
  }
  if (data.behanceUrl) {
    document.querySelectorAll('a[href*="behance.net"]').forEach(a => a.href = data.behanceUrl);
  }
  if (data.linkedinUrl) {
    document.querySelectorAll('a[href*="linkedin.com"]').forEach(a => a.href = data.linkedinUrl);
  }
  if (data.whatsappUrl) {
    document.querySelectorAll('a[href*="wa.me"]').forEach(a => a.href = data.whatsappUrl);
  }

  // About Section
  const aboutHi = document.querySelector('.about__body .hi');
  if (aboutHi && data.aboutTitle) aboutHi.textContent = data.aboutTitle;

  const aboutPs = document.querySelectorAll('.about__body p');
  if (aboutPs[0] && data.aboutP1) aboutPs[0].innerHTML = data.aboutP1;
  if (aboutPs[1] && data.aboutP2) aboutPs[1].innerHTML = data.aboutP2;

  // Stats
  const statDivs = document.querySelectorAll('.about__stats > div');
  if (statDivs[0]) {
    if (data.stat1Num) statDivs[0].querySelector('b').textContent = data.stat1Num;
    if (data.stat1Label) statDivs[0].querySelector('span').textContent = data.stat1Label;
  }
  if (statDivs[1]) {
    if (data.stat2Num) statDivs[1].querySelector('b').textContent = data.stat2Num;
    if (data.stat2Label) statDivs[1].querySelector('span').textContent = data.stat2Label;
  }
  if (statDivs[2]) {
    if (data.stat3Num) statDivs[2].querySelector('b').textContent = data.stat3Num;
    if (data.stat3Label) statDivs[2].querySelector('span').textContent = data.stat3Label;
  }

  // Skills
  if (Array.isArray(data.skills) && data.skills.length) {
    const skillsContainer = document.querySelector('.about__skills');
    if (skillsContainer) {
      let html = '<div class="skills-title">My Skills</div>';
      data.skills.forEach(s => {
        const pct = parseInt(s.percent || '0', 10);
        html += `<div class="skill"><div class="skill__head"><span>${s.name}</span><b>${pct}%</b></div><div class="skill__track"><i style="--w:${pct}%"></i></div></div>`;
      });
      skillsContainer.innerHTML = html;
    }
  }

  // Contact & Footer
  const contactLabel = document.querySelector('.contact__label');
  if (contactLabel && data.contactLabel) contactLabel.textContent = data.contactLabel;

  const contactH2 = document.querySelector('.contact h2');
  if (contactH2 && data.contactHeadlineHtml) contactH2.innerHTML = data.contactHeadlineHtml;

  const cols = document.querySelectorAll('.contact__col');
  if (cols[1]) {
    const aList = cols[1].querySelectorAll('a');
    if (aList[0] && data.location) aList[0].textContent = data.location;
    if (aList[1] && data.timezone) aList[1].textContent = data.timezone;
  }

  const footerDiv = document.querySelector('.footer > div:first-child');
  if (footerDiv && data.footerCopy) footerDiv.textContent = data.footerCopy;
};

const loadSiteContent = () => {
  return fetch('/api/content', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
      if (d && d.content) applySiteContent(d.content);
    })
    .catch(() => {});
};

loadSiteContent();

/* illuminate the name near the cursor with a soft spotlight */
function initNameSpotlight() {
  const chs = document.querySelectorAll('.hero__name .ch');
  if (!chs.length) return;
  const RADIUS = 150;
  const HEX = 'd6f772';
  const hexToRgb = h => [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  const base = hexToRgb('111111');
  const bright = hexToRgb(HEX);
  window.onmousemove = e => {
    const cx = e.clientX, cy = e.clientY;
    chs.forEach(ch => {
      const r = ch.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      const t = Math.min(1, Math.max(0, 1 - d / RADIUS));
      const e2 = t * t * (3 - 2 * t);
      const col = [0,1,2].map(i => Math.round(base[i] + (bright[i] - base[i]) * e2));
      ch.style.color = 'rgb(' + col.join(',') + ')';
    });
  };
}
initNameSpotlight();

/* spotlight on work titles near cursor */
const spotlightItems = document.querySelectorAll('.work-item .title');
if (spotlightItems.length && document.querySelector('.hero__name .ch')) {
  spotlightItems.forEach(item => {
    const sub = item.querySelector('.sub');
    const textNode = item.childNodes[0];
    const mainText = textNode && textNode.nodeType === Node.TEXT_NODE ? textNode.textContent : item.textContent;
    item.querySelectorAll('.spotlight-ch').forEach(n => n.remove());
    const frag = document.createDocumentFragment();
    for (const char of mainText) {
      const s = document.createElement('span');
      s.className = 'spotlight-ch';
      s.textContent = char === ' ' ? '\u00A0' : char;
      frag.appendChild(s);
    }
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      item.replaceChild(frag, textNode);
    } else {
      item.appendChild(frag);
    }
  });
  const spotChars = document.querySelectorAll('.spotlight-ch');
  const RADIUS2 = 150;
  document.addEventListener('mousemove', e => {
    const cx = e.clientX, cy = e.clientY;
    spotChars.forEach(ch => {
      const container = ch.closest('.title');
      const rect = container.getBoundingClientRect();
      const hovered = e.clientX >= rect.left && e.clientX <= rect.right &&
                      e.clientY >= rect.top && e.clientY <= rect.bottom;
      const r = ch.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      ch.style.color = (hovered && d < RADIUS2) ? '#d6f772' : '#111111';
    });
  });
}

/* avatar zoom on touch / click */
