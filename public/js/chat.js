// =====================================================================
// 模块3：聊天功能 (Chat)
// =====================================================================
Lobster.Chat = {
  chatHistory: [],
  longMemoryEnabled: false,
  longMemoryStore: [],
  currentImage: null,

  init() {
    const memoryToggle = document.getElementById('memoryToggle');
    if (memoryToggle) {
      memoryToggle.addEventListener('change', (e) => {
        Lobster.Chat.longMemoryEnabled = e.target.checked;
        if (Lobster.Chat.longMemoryEnabled) {
          const stored = localStorage.getItem(`memory_${Lobster.Core.userId}`);
          if (stored) Lobster.Chat.longMemoryStore = JSON.parse(stored);
          Lobster.Core.setText('memoryStatus', stored ? `📚 已加载 ${Lobster.Chat.longMemoryStore.length/2} 轮历史记忆` : '✨ 开启长期记忆，对话将自动保存');
        } else {
          Lobster.Core.setText('memoryStatus', '');
        }
      });
    }
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
      sendBtn.onclick = () => {
        const text = document.getElementById('chat-input').innerText.trim();
        if (text || Lobster.Chat.currentImage) Lobster.Chat.sendMessage(text, Lobster.Chat.currentImage);
        const input = document.getElementById('chat-input');
        if (input) input.innerText = '';
      };
    }
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = e.target.innerText.trim();
          if (text || Lobster.Chat.currentImage) Lobster.Chat.sendMessage(text, Lobster.Chat.currentImage);
          e.target.innerText = '';
        }
      });
    }
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('image-upload');
    if (uploadBtn) uploadBtn.onclick = () => { if (fileInput) fileInput.click(); };
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            Lobster.Chat.currentImage = ev.target.result;
            Lobster.Chat.addMessage('图片已上传', 'assistant');
          };
          reader.readAsDataURL(file);
        }
      };
    }
  },

  addMessage(content, role) {
    const wrap = document.getElementById('chatWrap');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (typeof content === 'string' && content.startsWith('data:image')) {
      div.innerHTML = `< img src="${content}" class="img-msg">`;
    } else {
      div.innerHTML = `<div class="bubble">${Lobster.Core.escapeHtml(content)}</div>`;
    }
    wrap.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  },

  async sendMessage(content, imageBase64) {
    const localImage = imageBase64;
    Lobster.Chat.currentImage = null;
    const uploadInput = document.getElementById('image-upload');
    if (uploadInput) uploadInput.value = '';
    if (!content && !localImage) return;

    const wrap = document.getElementById('chatWrap');
    const userDiv = document.createElement('div');
    userDiv.className = 'message user';
    const userBubble = document.createElement('div');
    userBubble.className = 'bubble';
    if (localImage) {
      userBubble.innerHTML = `${content ? Lobster.Core.escapeHtml(content) + '<br>' : ''}< img src="${localImage}" class="img-msg" style="max-width:200px;border-radius:10px;margin-top:8px;">`;
    } else {
      userBubble.innerText = content;
    }
    userDiv.appendChild(userBubble);
    wrap.appendChild(userDiv);
    userDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });

    const agentId = document.getElementById('agent-selector').value;
    let historyToSend = Lobster.Chat.longMemoryEnabled
      ? (Lobster.Chat.longMemoryStore.length ? Lobster.Chat.longMemoryStore : Lobster.Chat.chatHistory)
      : Lobster.Chat.chatHistory.slice(-10);

    const aiDiv = document.createElement('div');
    aiDiv.className = 'message assistant';
    const aiBubble = document.createElement('div');
    aiBubble.className = 'bubble';
    aiBubble.innerText = '思考中...';
    aiDiv.appendChild(aiBubble);
    wrap.appendChild(aiDiv);

    let fullReply = '';
    let isHtmlPreview = false;

    try {
      const requestBody = {
        userId: Lobster.Core.userId,
        message: typeof content === 'string' ? content : "",
        agentId,
        history: historyToSend
      };
      if (localImage) requestBody.image = localImage;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        aiBubble.innerText = res.status === 403 ? '权限不足，请检查配置' : '错误：' + res.status;
        return;
      }

      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        const reply = data.reply || data.message || '';
        if (data.image) {
          aiBubble.innerHTML = `< img src="${data.image}" style="max-width:100%; border-radius:8px; margin-top:10px;" />`;
          fullReply = '截图已显示';
        } else if (reply && (reply.includes('<!DOCTYPE html') || reply.includes('<html'))) {
          Lobster.Chat.showHtmlPreview(reply, aiBubble);
          fullReply = reply;
          isHtmlPreview = true;
        } else {
          try {
            const inner = JSON.parse(reply);
            if (inner.success && inner.html) {
              let cleanHtml = inner.html.replace(/```html|```/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
              aiBubble.innerHTML = `<div style="font-weight:600;margin-bottom:8px;">✅ 排版完成！文章预览：</div><div style="max-height:300px;overflow-y:auto;background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:10px;border:1px solid #e2e8f0;">${cleanHtml}</div><button class="copy-btn">📋 复制文章代码</button>`;
              const copyBtn = aiBubble.querySelector('.copy-btn');
              copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(cleanHtml).then(() => {
                  copyBtn.innerText = '✅ 已复制';
                  setTimeout(() => copyBtn.innerText = '📋 复制文章代码', 2000);
                });
              });
              fullReply = '排版完成';
            } else {
              aiBubble.innerText = JSON.stringify(inner, null, 2);
              fullReply = JSON.stringify(inner);
            }
          } catch (e) {
            aiBubble.innerText = reply;
            fullReply = reply;
          }
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', currentEvent = '';
        aiBubble.style.whiteSpace = 'pre-wrap';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); }
            else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              if (currentEvent === 'error') {
                try { const parsed = JSON.parse(data); if (parsed.message) { aiBubble.innerText = '错误：' + parsed.message; return; } } catch (e) {}
              } else if (currentEvent === 'values' || currentEvent === '' || currentEvent === 'metadata') {
                if (currentEvent === 'metadata') continue;
                try {
                  const parsed = JSON.parse(data);
                  let text = "";
                  if (parsed.agent && parsed.agent.messages) {
                    const msgs = parsed.agent.messages;
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.kwargs && lastMsg.kwargs.content) text = lastMsg.kwargs.content;
                    else if (lastMsg && lastMsg.content) text = lastMsg.content;
                  } else if (parsed.messages && Array.isArray(parsed.messages)) {
                    const lastMsg = parsed.messages[parsed.messages.length - 1];
                    if (lastMsg && lastMsg.content) text = lastMsg.content;
                    else if (lastMsg && lastMsg.kwargs && lastMsg.kwargs.content) text = lastMsg.kwargs.content;
                  } else if (typeof parsed === "string") {
                    text = parsed;
                  }
                  if (text && typeof text === 'string') {
                    fullReply += text;
                    aiBubble.innerText = fullReply;
                  }
                } catch (e) {
                  const match = data.match(/"content":"([^"\\]*(?:\\.[^"\\]*)*)"/);
                  if (match && match[1]) {
                    let extracted = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    fullReply += extracted;
                    aiBubble.innerText = fullReply;
                  }
                }
              }
            }
          }
        }
        aiBubble.style.whiteSpace = '';
        aiBubble.innerHTML = Lobster.Core.simpleMarkdown(fullReply);
        if (!isHtmlPreview && fullReply && (fullReply.includes('<!DOCTYPE html') || fullReply.includes('<html'))) {
          Lobster.Chat.showHtmlPreview(fullReply, aiBubble);
        }
      }

      aiDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
      if (fullReply) {
        Lobster.Chat.chatHistory.push({ role: 'user', content: content || '[图片]' });
        Lobster.Chat.chatHistory.push({ role: 'assistant', content: fullReply });
        if (Lobster.Chat.chatHistory.length > 30) Lobster.Chat.chatHistory = Lobster.Chat.chatHistory.slice(-30);
        if (Lobster.Chat.longMemoryEnabled) {
          Lobster.Chat.longMemoryStore.push({ role: 'user', content: content || '[图片]' });
          Lobster.Chat.longMemoryStore.push({ role: 'assistant', content: fullReply });
          if (Lobster.Chat.longMemoryStore.length > 100) Lobster.Chat.longMemoryStore = Lobster.Chat.longMemoryStore.slice(-100);
          localStorage.setItem(`memory_${Lobster.Core.userId}`, JSON.stringify(Lobster.Chat.longMemoryStore));
          Lobster.Core.setText('memoryStatus', `📚 已记忆 ${Lobster.Chat.longMemoryStore.length/2} 轮对话`);
        }
      }
    } catch (err) {
      aiBubble.innerText = '请求失败: ' + err.message;
    } finally {
      Lobster.Chat.currentImage = null;
      const uploadInput = document.getElementById('image-upload');
      if (uploadInput) uploadInput.value = '';
    }
  },

  showHtmlPreview(html, bubble) {
    let previewContainer = document.getElementById('preview-container');
    const wrap = document.getElementById('chatWrap');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'preview-container';
      previewContainer.className = 'preview-container';
      previewContainer.style.display = 'flex';
      previewContainer.style.flexDirection = 'column';
      previewContainer.style.height = '400px';
      previewContainer.style.border = '1px solid rgba(120,150,255,0.2)';
      previewContainer.style.borderRadius = '12px';
      previewContainer.style.marginTop = '12px';
      previewContainer.style.overflow = 'hidden';
      previewContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; padding:8px 16px; background:rgba(20,20,20,0.6); border-bottom:1px solid rgba(120,150,255,0.2);">
          <span style="color:#94a3b8; font-size:13px;">🔍 代码预览</span>
          <button onclick="document.getElementById('preview-container').style.display='none'" style="background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.3); color:#d1fae5; padding:4px 14px; border-radius:20px; font-size:12px; cursor:pointer;">✕ 关闭</button>
        </div>
        <div style="display:flex; flex:1; min-height:300px;">
          <div id="preview-code" style="flex:1; overflow:auto; background:#1a1a1a; padding:16px; font-family:Courier New,monospace; font-size:13px; color:#d4d4d4; white-space:pre-wrap; word-break:break-all; border-right:1px solid rgba(120,150,255,0.1);"></div>
          <div style="flex:1; background:#fff; min-height:300px;">
            <iframe id="preview-frame" style="width:100%; height:100%; border:none; background:#fff;" sandbox="allow-scripts allow-modals allow-same-origin"></iframe>
          </div>
        </div>
      `;
      wrap.parentNode.insertBefore(previewContainer, wrap.nextSibling);
    }
    previewContainer.style.display = 'flex';
    const codePanel = document.getElementById('preview-code');
    const frame = document.getElementById('preview-frame');
    if (codePanel) codePanel.textContent = html;
    if (frame) frame.srcdoc = html;
    if (bubble) bubble.innerText = '✅ 已生成HTML代码，请在右侧预览';
  }
};