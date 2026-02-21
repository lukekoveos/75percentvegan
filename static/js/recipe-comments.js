/**
 * 75% Vegan Recipe Comments Widget
 * Embeddable comment system with ratings, emoji reactions, and suggestions.
 */
(function() {
  const API = 'https://comments.blunek.services';
  const EMOJIS = ['❤️', '🔥', '😋', '👍', '🤔', '🌱'];
  const STARS = [1, 2, 3, 4, 5];
  
  // Get recipe slug from URL
  function getSlug() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'unknown';
  }

  // Render star rating display
  function renderStars(rating, interactive = false, onSelect = null) {
    const container = document.createElement('div');
    container.className = 'rv-stars';
    STARS.forEach(n => {
      const star = document.createElement('span');
      star.textContent = n <= rating ? '★' : '☆';
      star.className = 'rv-star' + (n <= rating ? ' rv-star-filled' : '');
      star.dataset.value = n;
      if (interactive) {
        star.style.cursor = 'pointer';
        star.addEventListener('click', () => onSelect && onSelect(n));
        star.addEventListener('mouseenter', () => {
          container.querySelectorAll('.rv-star').forEach((s, i) => {
            s.textContent = i < n ? '★' : '☆';
            s.classList.toggle('rv-star-filled', i < n);
          });
        });
        container.addEventListener('mouseleave', () => {
          const current = container.dataset.selected || 0;
          container.querySelectorAll('.rv-star').forEach((s, i) => {
            s.textContent = i < current ? '★' : '☆';
            s.classList.toggle('rv-star-filled', i < current);
          });
        });
      }
      container.appendChild(star);
    });
    return container;
  }

  // Format relative time
  function timeAgo(dateStr) {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
    return date.toLocaleDateString();
  }

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  }

  // Main render
  async function init() {
    const target = document.getElementById('recipe-comments');
    if (!target) return;
    
    const slug = getSlug();
    const formLoadedAt = Date.now();
    
    target.innerHTML = `
      <div class="rv-widget">
        <h2 class="rv-title">💬 Comments & Ratings</h2>
        
        <!-- Emoji Reactions for the recipe -->
        <div class="rv-recipe-reactions" id="rv-reactions"></div>
        
        <!-- Rating Summary -->
        <div class="rv-rating-summary" id="rv-rating-summary"></div>
        
        <!-- Comments List -->
        <div class="rv-comments-list" id="rv-comments-list">
          <p class="rv-loading">Loading comments...</p>
        </div>
        
        <!-- Comment Form -->
        <div class="rv-form-wrapper">
          <h3>Leave a comment</h3>
          <form id="rv-comment-form" class="rv-form">
            <div class="rv-form-row">
              <input type="text" id="rv-name" placeholder="Your name" maxlength="50" required class="rv-input" />
            </div>
            <!-- Honeypot -->
            <div style="position:absolute;left:-9999px;top:-9999px;">
              <input type="text" name="website" id="rv-honeypot" tabindex="-1" autocomplete="off" />
            </div>
            <div class="rv-form-row">
              <div class="rv-rating-input" id="rv-rating-input">
                <label>Rating (optional):</label>
              </div>
            </div>
            <div class="rv-form-row">
              <textarea id="rv-comment" placeholder="What did you think of this recipe?" maxlength="1000" required class="rv-textarea" rows="3"></textarea>
            </div>
            <div class="rv-form-row rv-form-actions">
              <button type="submit" class="rv-btn rv-btn-primary">Post Comment</button>
              <button type="button" class="rv-btn rv-btn-secondary" id="rv-suggest-btn">💡 Suggest a Recipe</button>
            </div>
            <div id="rv-form-msg" class="rv-form-msg"></div>
          </form>
        </div>
        
        <!-- Suggestion Form (hidden by default) -->
        <div class="rv-form-wrapper rv-suggestion-form" id="rv-suggestion-form" style="display:none;">
          <h3>💡 Suggest a Recipe</h3>
          <p class="rv-hint">Have an idea for a 75% vegan recipe? Tell us! Suggestions are reviewed before posting.</p>
          <form id="rv-suggest-form" class="rv-form">
            <div class="rv-form-row">
              <input type="text" id="rv-suggest-name" placeholder="Your name" maxlength="50" required class="rv-input" />
            </div>
            <div style="position:absolute;left:-9999px;top:-9999px;">
              <input type="text" name="website" id="rv-suggest-honeypot" tabindex="-1" autocomplete="off" />
            </div>
            <div class="rv-form-row">
              <textarea id="rv-suggest-text" placeholder="What recipe would you like to see? Any special ingredients or dietary needs?" maxlength="1000" required class="rv-textarea" rows="4"></textarea>
            </div>
            <div class="rv-form-row">
              <button type="submit" class="rv-btn rv-btn-primary">Submit Suggestion</button>
              <button type="button" class="rv-btn rv-btn-secondary" id="rv-suggest-cancel">Cancel</button>
            </div>
            <div id="rv-suggest-msg" class="rv-form-msg"></div>
          </form>
        </div>
      </div>
    `;
    
    // Load data
    loadReactions(slug);
    loadComments(slug);
    
    // Rating input
    let selectedRating = 0;
    const ratingContainer = document.getElementById('rv-rating-input');
    const stars = renderStars(0, true, (n) => {
      selectedRating = n;
      stars.dataset.selected = n;
    });
    ratingContainer.appendChild(stars);
    
    // Comment form
    document.getElementById('rv-comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('rv-form-msg');
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Posting...';
      
      try {
        const result = await api('/comments', 'POST', {
          recipe_slug: slug,
          name: document.getElementById('rv-name').value.trim(),
          comment: document.getElementById('rv-comment').value.trim(),
          rating: selectedRating || null,
          website: document.getElementById('rv-honeypot').value,
          form_loaded_at: formLoadedAt,
        });
        
        msg.textContent = result.message;
        msg.className = 'rv-form-msg rv-success';
        
        if (result.approved) {
          loadComments(slug);
        }
        
        // Reset form
        document.getElementById('rv-comment').value = '';
        selectedRating = 0;
        stars.dataset.selected = 0;
        stars.querySelectorAll('.rv-star').forEach(s => {
          s.textContent = '☆';
          s.classList.remove('rv-star-filled');
        });
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'rv-form-msg rv-error';
      }
      
      btn.disabled = false;
      btn.textContent = 'Post Comment';
    });
    
    // Suggestion toggle
    document.getElementById('rv-suggest-btn').addEventListener('click', () => {
      document.getElementById('rv-suggestion-form').style.display = 'block';
      document.getElementById('rv-suggest-text').focus();
    });
    
    document.getElementById('rv-suggest-cancel').addEventListener('click', () => {
      document.getElementById('rv-suggestion-form').style.display = 'none';
    });
    
    // Suggestion form
    document.getElementById('rv-suggest-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('rv-suggest-msg');
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      
      try {
        const result = await api('/comments', 'POST', {
          recipe_slug: slug,
          name: document.getElementById('rv-suggest-name').value.trim(),
          comment: document.getElementById('rv-suggest-text').value.trim(),
          is_suggestion: true,
          website: document.getElementById('rv-suggest-honeypot').value,
          form_loaded_at: formLoadedAt,
        });
        
        msg.textContent = '✅ Thanks! Your suggestion has been submitted for review.';
        msg.className = 'rv-form-msg rv-success';
        document.getElementById('rv-suggest-text').value = '';
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'rv-form-msg rv-error';
      }
      
      btn.disabled = false;
    });
  }
  
  async function loadReactions(slug) {
    const container = document.getElementById('rv-reactions');
    try {
      const data = await api(`/reactions/${slug}`);
      renderReactions(container, slug, data.reactions);
    } catch {
      container.innerHTML = '';
      renderReactions(container, slug, {});
    }
  }
  
  function renderReactions(container, slug, counts) {
    container.innerHTML = '<span class="rv-reactions-label">React to this recipe:</span>';
    EMOJIS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'rv-reaction-btn';
      btn.innerHTML = `${emoji} <span class="rv-reaction-count">${counts[emoji] || 0}</span>`;
      btn.addEventListener('click', async () => {
        try {
          const data = await api('/reactions', 'POST', { recipe_slug: slug, emoji });
          renderReactions(container, slug, data.reactions);
        } catch (err) {
          // Silently handle (likely already reacted or rate limited)
        }
      });
      container.appendChild(btn);
    });
  }
  
  async function loadComments(slug) {
    const container = document.getElementById('rv-comments-list');
    const summary = document.getElementById('rv-rating-summary');
    
    try {
      const data = await api(`/comments/${slug}`);
      
      // Rating summary
      if (data.avg_rating) {
        summary.innerHTML = `
          <div class="rv-avg-rating">
            <span class="rv-avg-stars">${'★'.repeat(Math.round(data.avg_rating))}${'☆'.repeat(5 - Math.round(data.avg_rating))}</span>
            <span class="rv-avg-value">${data.avg_rating}</span>
            <span class="rv-avg-count">(${data.rating_count} rating${data.rating_count !== 1 ? 's' : ''})</span>
          </div>
        `;
      } else {
        summary.innerHTML = '<p class="rv-no-ratings">No ratings yet — be the first!</p>';
      }
      
      // Comments
      if (data.comments.length === 0) {
        container.innerHTML = '<p class="rv-no-comments">No comments yet. Be the first to share your thoughts!</p>';
        return;
      }
      
      container.innerHTML = '';
      data.comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'rv-comment' + (c.admin_liked ? ' rv-admin-liked' : '');
        
        let ratingHtml = '';
        if (c.rating) {
          ratingHtml = `<span class="rv-comment-rating">${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)}</span>`;
        }
        
        let likedBadge = '';
        if (c.admin_liked) {
          likedBadge = '<span class="rv-liked-badge" title="Liked by 75% Vegan">🌱</span>';
        }
        
        div.innerHTML = `
          <div class="rv-comment-header">
            <strong class="rv-comment-name">${escapeHtml(c.name)}</strong>
            ${likedBadge}
            ${ratingHtml}
            <span class="rv-comment-time">${timeAgo(c.created_at)}</span>
          </div>
          <p class="rv-comment-text">${escapeHtml(c.comment)}</p>
          <div class="rv-comment-actions">
            <button class="rv-comment-react" data-id="${c.id}" data-emoji="❤️">❤️ ${c.hearts || 0}</button>
            <button class="rv-comment-react" data-id="${c.id}" data-emoji="👍">👍 ${c.thumbs || 0}</button>
            <button class="rv-comment-react" data-id="${c.id}" data-emoji="😋">😋 ${c.yummy || 0}</button>
          </div>
        `;
        
        // Comment reaction handlers
        div.querySelectorAll('.rv-comment-react').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/comments/${btn.dataset.id}/react`, 'POST', {
                comment_id: parseInt(btn.dataset.id),
                emoji: btn.dataset.emoji
              });
              loadComments(slug); // Refresh
            } catch {}
          });
        });
        
        container.appendChild(div);
      });
      
    } catch (err) {
      container.innerHTML = '<p class="rv-error">Could not load comments.</p>';
    }
  }
  
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
