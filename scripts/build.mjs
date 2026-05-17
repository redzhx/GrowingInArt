#!/usr/bin/env node

/**
 * Build script: process 宝贝作品/ markdown files → public/artworks/ + public/js/data.js
 * Usage: node scripts/build.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, '宝贝作品');
const ARTWORKS_OUT = path.join(ROOT, 'public', 'artworks');
const DATA_OUT = path.join(ROOT, 'public', 'js', 'data.js');

// ── Helpers ──────────────────────────────────────────────

function cleanFilename(filename) {
  let s = filename.replace(/\.md$/, '');
  s = s.replace(/\s+[a-f0-9]{32}$/, '');
  return s.trim();
}

function parseChild(text) {
  const hasYifei = /@圆圆|任羿霏|羿霏/.test(text);
  const hasYicheng = /@丞丞|@成成|朱羿丞|羿丞/.test(text);
  if (hasYifei && hasYicheng) return 'both';
  if (hasYifei) return 'yifei';
  if (hasYicheng) return 'yicheng';
  return null;
}

function slugify(title) {
  let s = title
    .replace(/[@\s/\\?%#&]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Keep Chinese chars, alphanumeric, hyphens
  s = s.replace(/[^a-z0-9一-鿿-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s.toLowerCase() || 'untitled';
}

function normalizeDate(d) {
  if (!d) return '';
  const m = d.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function parseAge(s) {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function decodeUrl(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

// ── Markdown Parser ──────────────────────────────────────

function parseMarkdown(content) {
  const lines = content.split('\n');
  const result = {
    title: '',
    date: '',
    weekday: '',
    tags: [],
    age: null,
    birthday: '',
    images: [],
    videos: [],
    files: [],
    prose: [],
    sections: [],
  };

  let currentSection = null;
  let proseBuf = [];

  function flushProse() {
    const text = proseBuf.join('\n').trim();
    if (text) result.prose.push(text);
    proseBuf = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^#{1,6}\s/.test(line)) {
      flushProse();
      const header = line.replace(/^#+\s*/, '').trim();
      // First h1 is the title
      if (line.startsWith('# ') && !result.title) {
        result.title = header;
        continue;
      }
      currentSection = { header, images: [] };
      result.sections.push(currentSection);
      continue;
    }

    let m;
    if ((m = line.match(/^Date:\s*(.+)/))) { result.date = normalizeDate(m[1].trim()); continue; }
    if (/^星期:\s*(.+)/.test(line)) { result.weekday = RegExp.$1.trim(); continue; }
    if (/^Tags:\s*(.+)/.test(line)) { result.tags = RegExp.$1.split(/[,，]/).map(t => t.trim()).filter(Boolean); continue; }
    if ((m = line.match(/^年龄:\s*(.+)/))) { result.age = parseAge(m[1].trim()); continue; }
    if (/^生日:\s*(.+)/.test(line)) { result.birthday = RegExp.$1.trim(); continue; }

    // Image: ![alt](path)
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) {
      const img = { alt: m[1] || '', src: m[2] };
      result.images.push(img);
      if (currentSection) currentSection.images.push(img);
      flushProse();
      continue;
    }

    // Video/file link
    if ((m = line.match(/^\[([^\]]*)\]\(([^)]+)\)/))) {
      const src = m[2];
      if (/\.(mov|mp4|avi|webm|m4v)(\?.*)?$/i.test(src)) {
        result.videos.push({ label: m[1] || '', src });
      } else if (/\.(pdf|docx?|xlsx?|zip)(\?.*)?$/i.test(src)) {
        result.files.push({ label: m[1] || '', src });
      }
      flushProse();
      continue;
    }

    if (/^---+$/.test(line)) { flushProse(); continue; }
    if (!line.trim()) { flushProse(); continue; }

    proseBuf.push(line);
  }
  flushProse();

  return result;
}

// ── Child inference ──────────────────────────────────────

function inferChildFromProse(proseText) {
  const yifei = /任羿霏|霏霏|圆圆/.test(proseText);
  const yicheng = /朱羿丞|羿丞|丞丞|成成|小朱/.test(proseText);
  if (yifei && yicheng) return 'both';
  if (yifei) return 'yifei';
  if (yicheng) return 'yicheng';
  return null;
}

function inferChildByDate(dateStr) {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4));
  if (year >= 2023) return 'yifei';
  if (year <= 2017) return 'both';
  return null;
}

// ── Teacher notes extraction ─────────────────────────────

function extractTeacherNotes(prose) {
  const fullText = prose.join('\n\n');
  const notes = { yifei: '', yicheng: '', general: '' };

  const parts = fullText.split(/(?:^|\n)(?=🎨【[^】]+】)/);
  let generalParts = [];

  for (const part of parts) {
    const m = part.match(/^🎨【([^】]+)】\s*/);
    if (m) {
      const name = m[1];
      const text = part.replace(/^🎨【[^】]+】\s*/, '').trim();
      if (/霏|任羿霏|圆圆/.test(name)) {
        notes.yifei += (notes.yifei ? '\n\n' : '') + text;
      } else if (/丞|成|小朱|朱羿丞|羿丞/.test(name)) {
        notes.yicheng += (notes.yicheng ? '\n\n' : '') + text;
      } else if (/暖儿|芷嫣|毛豆|悦然|朵朵|子涵|雨桐|梓涵|一诺|欣然|子萱|子墨|浩宇|思远|明哲|子豪|博文|浩轩/i.test(name)) {
        notes.general += (notes.general ? '\n\n' : '') + `🎨【${name}】${text}`;
      } else {
        notes.general += (notes.general ? '\n\n' : '') + `🎨【${name}】${text}`;
      }
    } else if (part.trim()) {
      generalParts.push(part.trim());
    }
  }

  if (generalParts.length) {
    notes.general = (notes.general ? notes.general + '\n\n' : '') + generalParts.join('\n\n');
  }
  return notes;
}

function extractClassmates(prose) {
  const names = new Set();
  const fullText = prose.join('\n\n');
  const pattern = /🎨【([^】]+)】/g;
  let m;
  while ((m = pattern.exec(fullText))) {
    const name = m[1].trim();
    if (/霏|任羿霏|圆圆|丞|成|小朱|朱羿丞|羿丞/.test(name)) continue;
    names.add(name);
  }
  return [...names];
}

function isClassSection(header) {
  return /^\d+班|班$|班同学|其他同学|作品墙|大家/.test(header) ||
         /^[A-Z]老师/.test(header);
}

// ── Image path mapping ───────────────────────────────────

/**
 * Build a mapping from URL-encoded source paths → actual filenames in asset dir.
 * The .md files reference images as `dir%20name/filename.jpg` but on disk they're `dir name/filename.jpg`.
 */
function buildAssetMap(assetDir) {
  const map = new Map(); // URL-encoded key → basename on disk
  if (!fs.existsSync(assetDir)) return map;

  const files = fs.readdirSync(assetDir);
  for (const f of files) {
    const fullPath = path.join(assetDir, f);
    if (fs.statSync(fullPath).isFile()) {
      // Map by basename
      map.set(f, f);
      // Also map by URL-encoded basename
      try { map.set(encodeURIComponent(f), f); } catch {}
    }
  }
  return map;
}

/**
 * Convert an old URL-encoded markdown path to the new output path.
 * e.g. "10-01%20素描写生/863ff1b65b588432cb4e7dc348d264f8.jpg"
 *   → "artworks/2025-10-01-10-01-素描写生/863ff1b65b588432cb4e7dc348d264f8.jpg"
 */
function rebaseImagePath(oldPath, artworkId, assetMap) {
  const parts = oldPath.split('/');
  const rawBasename = parts[parts.length - 1];

  let basename = assetMap.get(rawBasename);
  if (!basename) {
    try {
      const decoded = decodeURIComponent(rawBasename);
      basename = assetMap.get(decoded) || decoded;
    } catch {
      basename = rawBasename;
    }
  }

  return `artworks/${artworkId}/${basename}`;
}

// ── CSV parser ───────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('🔨 Building artwork data...\n');

  fs.mkdirSync(ARTWORKS_OUT, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_OUT), { recursive: true });

  const mdFiles = fs.readdirSync(SOURCE)
    .filter(f => f.endsWith('.md'))
    .sort();

  const artworks = [];
  const errors = [];
  let copiedCount = 0;

  for (const mdFile of mdFiles) {
    const mdPath = path.join(SOURCE, mdFile);
    const content = fs.readFileSync(mdPath, 'utf-8');
    const cleanTitle = cleanFilename(mdFile);

    const parsed = parseMarkdown(content);
    if (!parsed.title) parsed.title = cleanTitle;

    // Determine child
    let child = parseChild(mdFile) || parseChild(cleanTitle);
    if (!child) {
      const pc = inferChildFromProse(parsed.prose.join('\n'));
      if (pc) child = pc;
    }
    if (!child) child = inferChildByDate(parsed.date);
    if (!child) child = 'yifei';

    // Generate ID
    const dateFromTitle = cleanTitle.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    const dateStr = parsed.date || (dateFromTitle ?
      `${dateFromTitle[1]}-${dateFromTitle[2].padStart(2,'0')}-${dateFromTitle[3].padStart(2,'0')}` : '');
    const titleSlug = slugify(cleanTitle.replace(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*/, ''));
    const uniqueId = (dateStr ? dateStr + '-' + titleSlug : titleSlug)
      .replace(/[^a-z0-9一-鿿-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Find asset directory
    const assetDir = path.join(SOURCE, cleanTitle);
    const assetMap = buildAssetMap(assetDir);

    // Copy assets to output
    const outDir = path.join(ARTWORKS_OUT, uniqueId);
    fs.mkdirSync(outDir, { recursive: true });

    if (fs.existsSync(assetDir)) {
      try {
        const files = fs.readdirSync(assetDir);
        for (const f of files) {
          const src = path.join(assetDir, f);
          const ext = path.extname(f).toLowerCase();
          const isImage = /\.(jpe?g|png|webp)$/i.test(ext);
          const isVideo = /\.(mov|mp4|avi|webm|m4v)$/i.test(ext);

          if (isVideo) {
            // Just copy videos (they're usually small clips)
            const dst = path.join(outDir, f);
            if (!fs.existsSync(dst)) {
              try { fs.copyFileSync(src, dst); copiedCount++; } catch {}
            }
          } else if (isImage) {
            // Optimize: resize to max 1600px, keep original format for path compatibility
            const dst = path.join(outDir, f);
            if (!fs.existsSync(dst)) {
              try {
                if (ext === '.png') {
                  await sharp(src)
                    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                    .png({ quality: 80, compressionLevel: 9 })
                    .toFile(dst);
                } else {
                  await sharp(src)
                    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 82, mozjpeg: true })
                    .toFile(dst);
                }
                copiedCount++;
              } catch {
                try { fs.copyFileSync(src, dst); copiedCount++; } catch {}
              }
            }
          } else {
            const dst = path.join(outDir, f);
            if (!fs.existsSync(dst)) {
              try { fs.copyFileSync(src, dst); copiedCount++; } catch {}
            }
          }
        }
      } catch (e) {
        errors.push(`Copy error for ${uniqueId}: ${e.message}`);
      }
    }

    // Determine primary image & classmate works from sections
    let primaryImage = '';
    let classWorks = [];

    if (parsed.sections.length > 0) {
      let firstNonClassIdx = -1;
      for (let i = 0; i < parsed.sections.length; i++) {
        if (!isClassSection(parsed.sections[i].header) && firstNonClassIdx === -1) {
          firstNonClassIdx = i;
        }
      }

      if (firstNonClassIdx >= 0) {
        const mainSection = parsed.sections[firstNonClassIdx];
        if (mainSection.images.length > 0) {
          primaryImage = mainSection.images[0].src;
        }
      }

      // Collect classmate works from class sections (e.g., # 15班, # 16班)
      for (const section of parsed.sections) {
        if (isClassSection(section.header)) {
          for (const img of section.images) {
            classWorks.push({
              name: img.alt || section.header || '',
              img: img.src,
              isHero: classWorks.length === 0,
            });
          }
        }
      }

      // If no explicit class section, but sections after main one have images
      // (e.g., # 圆圆 and # 丞丞 sections in same file), treat as classmate works
      if (classWorks.length === 0 && parsed.sections.length > 1) {
        for (let i = 0; i < parsed.sections.length; i++) {
          if (i !== firstNonClassIdx && parsed.sections[i].images.length > 0) {
            for (const img of parsed.sections[i].images) {
              classWorks.push({
                name: parsed.sections[i].header || img.alt || '',
                img: img.src,
                isHero: false,
              });
            }
          }
        }
      }
    }

    // Fallback: no sections → first image is primary
    if (!primaryImage && parsed.images.length > 0) {
      primaryImage = parsed.images[0].src;
    }

    // If no sections but many images (5+) and no prose → likely classmate work collection
    // Images after the primary are treated as classWorks, not scene photos
    if (classWorks.length === 0 && parsed.sections.length === 0 && parsed.images.length >= 5 && parsed.prose.length === 0) {
      for (let i = 1; i < parsed.images.length; i++) {
        classWorks.push({
          name: parsed.images[i].alt || '',
          img: parsed.images[i].src,
          isHero: i === 1,
        });
      }
    }

    // Scene media: videos only by default
    const classImgSrcs = new Set(classWorks.map(cw => cw.img));
    const sceneMedia = [
      ...parsed.videos.map(v => ({ type: 'video', src: v.src, label: v.label || '上课视频' })),
    ];

    // Add extra images as scene photos only when NOT already classWorks
    // and total image count is moderate (≤5) — suggesting alternate angles, not classmates
    let sceneImgCount = 0;
    if (classWorks.length === 0 || parsed.images.length <= 5) {
      for (const img of parsed.images) {
        if (img.src !== primaryImage && !classImgSrcs.has(img.src) && sceneImgCount < 6) {
          sceneMedia.push({ type: 'image', src: img.src, label: img.alt || '' });
          sceneImgCount++;
        }
      }
    }

    // Extra images (alternate views): only when few total images and no classmate works
    const extraImages = [];
    if (parsed.images.length > 1 && parsed.images.length <= 5 && classWorks.length === 0) {
      for (let i = 1; i < Math.min(parsed.images.length, 4); i++) {
        if (parsed.images[i].src !== primaryImage) {
          extraImages.push(parsed.images[i].src);
        }
      }
    }

    // School and medium inference
    const allText = mdFile + ' ' + parsed.title + ' ' + parsed.prose.join(' ');
    let school = '';
    if (/天艺四方|天艺/.test(allText)) school = '天艺四方';
    else if (/玩美之徒/.test(allText)) school = '玩美之徒';
    else if (/雨花树/.test(allText)) school = '雨花树';
    else if (/东城国际/.test(allText)) school = '东城国际';
    else if (/新点美术/.test(allText)) school = '新点美术';
    else if (/天智/.test(allText)) school = '天智创意美术';

    let medium = '';
    if (/素描/.test(allText)) medium = '素描';
    else if (/水粉/.test(allText)) medium = '水粉';
    else if (/彩铅/.test(allText)) medium = '彩铅';
    else if (/油画/.test(allText)) medium = '油画';
    else if (/速写/.test(allText)) medium = '速写';
    else if (/漫画|卡通|动漫/.test(allText)) medium = '动漫';
    else if (/水墨|国画/.test(allText)) medium = '国画';
    else if (/手工|陶泥|粘土/.test(allText)) medium = '手工';
    else if (/立体画/.test(allText)) medium = '立体画';
    else if (/创意/.test(allText)) medium = '创意美术';
    else if (/色彩/.test(allText)) medium = '色彩';

    // Category detection
    let category = 'artwork';
    if (/课程介绍|上课通知|备课计划|缴费|试听课/.test(allText)) {
      category = 'info';
    } else if (/家长会|总结|反馈/.test(allText) && parsed.images.length <= 5) {
      category = 'note';
    } else if (/通知/.test(allText) && parsed.images.length === 0) {
      category = 'info';
    } else if (parsed.images.length === 0 && parsed.videos.length === 0) {
      category = 'note';
    }
    // Course notes with lots of images are still 'artwork' (classmate collections)

    // Teacher notes
    const teacherNotes = extractTeacherNotes(parsed.prose);
    const teacherNoteKey = child === 'yifei' ? 'yifei' : child === 'yicheng' ? 'yicheng' : 'general';
    let teacherNote = teacherNotes[teacherNoteKey] || teacherNotes.general || '';
    let processNote = '';

    // If general notes differ from teacher note, use as process note
    if (teacherNotes.general && teacherNoteKey !== 'general' && teacherNotes.general !== teacherNote) {
      processNote = teacherNotes.general;
    }
    // Look for process-related prose (non-teacher)
    const processLines = parsed.prose.filter(p =>
      !p.includes('🎨') && !p.includes('齐齐老师') && !p.includes('老师') &&
      (p.includes('创作') || p.includes('过程') || p.includes('步骤'))
    );
    if (processLines.length && !processNote) {
      processNote = processLines.join('\n\n');
    }

    // Classmates
    const classmates = extractClassmates(parsed.prose);

    // Rebase helper
    const rebase = (oldPath) => rebaseImagePath(oldPath, uniqueId, assetMap);
    const fullPath = primaryImage ? rebase(primaryImage) : '';

    // Generate thumbnail
    let thumbPath = fullPath;
    if (fullPath) {
      const fullOnDisk = path.join(ROOT, 'public', fullPath);
      if (fs.existsSync(fullOnDisk)) {
        try {
          const thumbDir = path.join(outDir, 'thumb');
          fs.mkdirSync(thumbDir, { recursive: true });
          const ext = path.extname(fullOnDisk);
          const thumbName = path.basename(fullOnDisk, ext) + '.webp';
          const thumbOnDisk = path.join(thumbDir, thumbName);
          if (!fs.existsSync(thumbOnDisk)) {
            await sharp(fullOnDisk)
              .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toFile(thumbOnDisk);
          }
          thumbPath = `artworks/${uniqueId}/thumb/${thumbName}`;
        } catch (e) {
          // If thumbnail fails, keep original path as thumb
        }
      }
    }

    const artwork = {
      id: uniqueId,
      title: parsed.title || cleanTitle,
      date: parsed.date || dateStr,
      age: parsed.age,
      child,
      school,
      medium: medium || parsed.tags.join('、'),
      category,
      tags: parsed.tags,
      full: fullPath,
      thumb: thumbPath,
      extraImages: extraImages.map(rebase),
      sceneMedia: sceneMedia.map(m => ({ ...m, src: rebase(m.src) })),
      classWorks: classWorks.map(cw => ({ ...cw, img: rebase(cw.img) })),
      teacherNote: teacherNote.replace(/\n{3,}/g, '\n\n').trim(),
      processNote: processNote.replace(/\n{3,}/g, '\n\n').trim(),
      classmates,
    };

    artworks.push(artwork);
  }

  // Write data.js
  const dataJS = `// Auto-generated artwork data — ${artworks.length} entries
// Generated: ${new Date().toISOString()}
// Do not edit manually

const artworks = ${JSON.stringify(artworks, null, 2)};

// Filtered galleries (artwork category only)
const galleryArtworks = artworks.filter(a => a.category === 'artwork');
const yifeiArtworks = galleryArtworks.filter(a => a.child === 'yifei' || a.child === 'both');
const yichengArtworks = galleryArtworks.filter(a => a.child === 'yicheng' || a.child === 'both');
// Full lists (all categories)
const yifeiAll = artworks.filter(a => a.child === 'yifei' || a.child === 'both');
const yichengAll = artworks.filter(a => a.child === 'yicheng' || a.child === 'both');
`;

  fs.writeFileSync(DATA_OUT, dataJS, 'utf-8');

  // Stats
  const yifeiCount = artworks.filter(a => a.child === 'yifei' || a.child === 'both').length;
  const yichengCount = artworks.filter(a => a.child === 'yicheng' || a.child === 'both').length;
  const withNotes = artworks.filter(a => a.teacherNote).length;
  const withClassWorks = artworks.filter(a => a.classWorks.length > 0).length;
  const withScene = artworks.filter(a => a.sceneMedia.length > 0).length;
  const withVideo = artworks.filter(a => a.sceneMedia.some(m => m.type === 'video')).length;

  console.log(`✅ Processed ${artworks.length} artworks`);
  console.log(`   yifei: ${yifeiCount} | yicheng: ${yichengCount}`);
  console.log(`   With teacher notes: ${withNotes}`);
  console.log(`   With classmate works: ${withClassWorks}`);
  console.log(`   With scene media: ${withScene} (${withVideo} with video)`);
  console.log(`   Files copied: ${copiedCount}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log(`   - ${e}`));
  }
  console.log(`\n📄 Data: ${path.relative(ROOT, DATA_OUT)}`);
  console.log(`📁 Assets: ${path.relative(ROOT, ARTWORKS_OUT)}/`);
}

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
