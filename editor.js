/* 纯前端编辑：数据存在内存 + localStorage，导出 data.json 后自行提交到仓库 */

(function () {
  'use strict';

  var DRAFT_KEY = 'profile-draft-v1';
  var state = { profile: null, dirty: false };

  var SECTIONS = ['education', 'experience', 'awards', 'skills'];

  var SECTION_META = {
    education: {
      label: '教育经历',
      primary: 'school',
      fields: [
        { key: 'school', label: '学校', required: true, max: 120, placeholder: '浙江大学' },
        { key: 'degree', label: '学历', max: 60, placeholder: '本科 / 硕士 / 博士' },
        { key: 'major', label: '专业', max: 120, placeholder: '计算机科学与技术' },
        { key: 'start', label: '开始时间', max: 40, placeholder: '2014.09', half: true },
        { key: 'end', label: '结束时间', max: 40, placeholder: '2018.06', half: true },
        { key: 'note', label: '补充说明', type: 'textarea', rows: 3, max: 4000, placeholder: '主修方向、毕业设计等，可留空。' }
      ]
    },
    experience: {
      label: '工作经历',
      primary: 'company',
      fields: [
        { key: 'company', label: '公司', required: true, max: 120, placeholder: '某某科技有限公司' },
        { key: 'role', label: '职位', max: 120, placeholder: '前端工程师' },
        { key: 'start', label: '开始时间', max: 40, placeholder: '2021.03', half: true },
        { key: 'end', label: '结束时间', max: 40, placeholder: '至今', half: true },
        { key: 'note', label: '工作内容', type: 'textarea', rows: 6, max: 4000, placeholder: '每行一条，前台显示为列表项。' }
      ]
    },
    awards: {
      label: '奖项',
      primary: 'title',
      fields: [
        { key: 'title', label: '奖项名称', required: true, max: 160, placeholder: '年度优秀员工' },
        { key: 'org', label: '颁发单位', max: 120, placeholder: '某某公司 / 学会名称' },
        { key: 'date', label: '时间', max: 60, placeholder: '2023 或 2017.11', half: true },
        { key: 'note', label: '说明', type: 'textarea', rows: 3, max: 4000, placeholder: '获奖原因、级别等，可留空。' }
      ]
    },
    skills: {
      label: '技能分组',
      primary: 'group',
      fields: [
        { key: 'group', label: '分组名称', required: true, max: 60, placeholder: '语言 / 框架 / 工程' },
        { key: 'items', label: '技能条目', type: 'textarea', rows: 4, max: 4000, placeholder: '用顿号或换行分隔，例如：JavaScript、TypeScript、CSS' }
      ]
    }
  };

  var BASIC_KEYS = ['name', 'title', 'summary', 'email', 'phone', 'city', 'website', 'github', 'avatar'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function newId() {
    return 'x' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------- 数据规范化 ---------------- */

  function normalize(input) {
    var out = { basic: {}, education: [], experience: [], awards: [], skills: [], updatedAt: '' };
    var basic = (input && input.basic) || {};
    BASIC_KEYS.forEach(function (key) {
      out.basic[key] = typeof basic[key] === 'string' ? basic[key] : '';
    });
    SECTIONS.forEach(function (section) {
      var list = Array.isArray(input && input[section]) ? input[section] : [];
      out[section] = list.map(function (item) {
        var clean = { id: item && typeof item.id === 'string' && item.id ? item.id : newId() };
        SECTION_META[section].fields.forEach(function (field) {
          clean[field.key] = item && typeof item[field.key] === 'string' ? item[field.key] : '';
        });
        return clean;
      });
    });
    out.updatedAt = (input && typeof input.updatedAt === 'string') ? input.updatedAt : '';
    return out;
  }

  /* ---------------- 草稿存取 ---------------- */

  var saveTimer = null;
  function saveDraftNow() {
    try {
      state.profile.updatedAt = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state.profile));
      state.dirty = true;
      setStatus('草稿已保存在本机 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch (err) {
      setStatus('本机存储不可用，改动仅在当前页面有效');
      console.warn(err);
    }
  }

  function saveDraftSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, 400);
  }

  function setStatus(text) {
    var el = $('#draft-status');
    if (el) el.textContent = text;
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  /* ---------------- 渲染 ---------------- */

  function fillBasic() {
    BASIC_KEYS.forEach(function (key) {
      var input = document.querySelector('[data-basic="' + key + '"]');
      if (input) input.value = state.profile.basic[key] || '';
    });
  }

  function fieldHtml(section, field, value) {
    var id = 'f-' + section + '-' + field.key;
    var label = '<span class="field-label">' + esc(field.label) + (field.required ? ' <em>必填</em>' : '') + '</span>';
    var common = 'id="' + id + '" data-key="' + field.key + '" maxlength="' + field.max + '"' +
      ' placeholder="' + esc(field.placeholder || '') + '"';

    var control = field.type === 'textarea'
      ? '<textarea ' + common + ' rows="' + (field.rows || 4) + '">' + esc(value) + '</textarea>'
      : '<input type="text" ' + common + ' value="' + esc(value) + '">';

    return '<label class="field" for="' + id + '">' + label + control + '</label>';
  }

  function itemHtml(section, item, index, total) {
    var meta = SECTION_META[section];
    var summaryMain = item[meta.primary] || '（未填写）';

    var subParts = [];
    if (section === 'education') subParts = [item.degree, item.major];
    else if (section === 'experience') subParts = [item.role];
    else if (section === 'awards') subParts = [item.org, item.date];

    var html = '';
    html += '<article class="item" data-id="' + esc(item.id) + '">';
    html += '<div class="item-head">';
    html += '<span class="item-summary" data-role="summary">' + esc(summaryMain);
    if (subParts.filter(Boolean).length) {
      html += '<small data-role="sub">' + esc(subParts.filter(Boolean).join(' · ')) + '</small>';
    }
    html += '</span>';
    html += '<span class="item-tools">';
    html += '<button type="button" class="btn btn-sm btn-ghost" data-act="up"' + (index === 0 ? ' disabled' : '') + ' title="上移">↑</button>';
    html += '<button type="button" class="btn btn-sm btn-ghost" data-act="down"' + (index === total - 1 ? ' disabled' : '') + ' title="下移">↓</button>';
    html += '<button type="button" class="btn btn-sm" data-act="toggle">编辑</button>';
    html += '<button type="button" class="btn btn-sm btn-danger" data-act="delete" title="删除">删除</button>';
    html += '</span>';
    html += '</div>';
    html += '<div class="item-body"><div class="grid-2">';
    html += meta.fields.map(function (field) { return fieldHtml(section, field, item[field.key] || ''); }).join('');
    html += '</div></div>';
    html += '</article>';
    return html;
  }

  function renderSection(section) {
    var meta = SECTION_META[section];
    var list = state.profile[section] || [];
    var host = $('#list-' + section);
    if (!host) return;

    if (!list.length) {
      host.innerHTML = '<div class="empty-state">还没有' + esc(meta.label) + '，点击下面的按钮添加。</div>';
      return;
    }
    host.innerHTML = list.map(function (item, index) {
      return itemHtml(section, item, index, list.length);
    }).join('');
  }

  function renderAll() {
    fillBasic();
    SECTIONS.forEach(renderSection);
  }

  /* ---------------- 交互 ---------------- */

  function bindNav() {
    $$('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.nav-item').forEach(function (item) { item.classList.toggle('is-active', item === btn); });
        $$('.panel').forEach(function (panel) { panel.classList.toggle('is-active', panel.dataset.panel === btn.dataset.target); });
      });
    });
  }

  function bindBasic() {
    BASIC_KEYS.forEach(function (key) {
      var input = document.querySelector('[data-basic="' + key + '"]');
      if (!input) return;
      input.addEventListener('input', function () {
        state.profile.basic[key] = input.value;
        saveDraftSoon();
      });
    });
  }

  function findItem(section, id) {
    return (state.profile[section] || []).filter(function (entry) { return entry.id === id; })[0] || null;
  }

  function refreshHead(card, section) {
    var item = findItem(section, card.dataset.id);
    if (!item) return;
    var meta = SECTION_META[section];
    var summary = $('[data-role="summary"]', card);
    if (!summary) return;

    var subParts = [];
    if (section === 'education') subParts = [item.degree, item.major];
    else if (section === 'experience') subParts = [item.role];
    else if (section === 'awards') subParts = [item.org, item.date];

    var main = item[meta.primary] || '（未填写）';
    var sub = subParts.filter(Boolean).join(' · ');

    summary.textContent = main;
    if (sub) {
      var small = document.createElement('small');
      small.setAttribute('data-role', 'sub');
      small.textContent = sub;
      summary.appendChild(small);
    }
  }

  function bindLists() {
    SECTIONS.forEach(function (section) {
      var addBtn = document.querySelector('[data-add="' + section + '"]');
      if (addBtn) addBtn.addEventListener('click', function () { addItem(section); });
    });

    // 输入即保存
    document.addEventListener('input', function (event) {
      var input = event.target;
      if (!input.dataset || !input.dataset.key) return;
      var card = input.closest('.item');
      if (!card) return;
      var panel = card.closest('.panel');
      var section = panel && panel.dataset.panel;
      if (!SECTIONS.includes(section)) return;

      var item = findItem(section, card.dataset.id);
      if (!item) return;
      item[input.dataset.key] = input.value;

      var meta = SECTION_META[section];
      if (input.dataset.key === meta.primary ||
          (section === 'education' && ['degree', 'major'].includes(input.dataset.key)) ||
          (section === 'experience' && input.dataset.key === 'role') ||
          (section === 'awards' && ['org', 'date'].includes(input.dataset.key))) {
        refreshHead(card, section);
      }
      saveDraftSoon();
    });

    // 按钮操作
    document.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      var card = btn.closest('.item');
      if (!card) return;
      var panel = card.closest('.panel');
      var section = panel && panel.dataset.panel;
      if (!SECTIONS.includes(section)) return;

      var act = btn.dataset.act;
      var id = card.dataset.id;

      if (act === 'toggle') {
        var open = card.classList.toggle('is-open');
        btn.textContent = open ? '收起' : '编辑';
      } else if (act === 'delete') {
        deleteItem(section, id);
      } else if (act === 'up' || act === 'down') {
        moveItem(section, id, act);
      }
    });
  }

  function addItem(section) {
    var meta = SECTION_META[section];
    var blank = { id: newId() };
    meta.fields.forEach(function (field) { blank[field.key] = ''; });

    state.profile[section].push(blank);
    saveDraftNow();
    renderSection(section);

    var card = document.querySelector('[data-id="' + blank.id + '"]');
    if (!card) return;
    card.classList.add('is-open');
    var toggle = card.querySelector('[data-act="toggle"]');
    if (toggle) toggle.textContent = '收起';
    var first = card.querySelector('input, textarea');
    if (first) first.focus();
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function deleteItem(section, id) {
    var item = findItem(section, id);
    var meta = SECTION_META[section];
    var name = item ? (item[meta.primary] || meta.label) : meta.label;
    if (!window.confirm('确定删除「' + name + '」吗？删除后记得导出并提交才会生效。')) return;

    state.profile[section] = state.profile[section].filter(function (entry) { return entry.id !== id; });
    saveDraftNow();
    renderSection(section);
    toast('已从草稿中删除');
  }

  function moveItem(section, id, direction) {
    var list = state.profile[section];
    var index = list.findIndex(function (entry) { return entry.id === id; });
    var target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;

    var moved = list.splice(index, 1)[0];
    list.splice(target, 0, moved);
    saveDraftNow();
    renderSection(section);
    var card = document.querySelector('[data-id="' + id + '"]');
    if (card) card.classList.add('is-open');
  }

  /* ---------------- 导出 / 导入 / 重置 ---------------- */

  function buildJson() {
    var payload = {
      basic: {},
      education: state.profile.education,
      experience: state.profile.experience,
      awards: state.profile.awards,
      skills: state.profile.skills,
      updatedAt: new Date().toISOString()
    };
    BASIC_KEYS.forEach(function (key) { payload.basic[key] = state.profile.basic[key] || ''; });
    return JSON.stringify(payload, null, 2) + '\n';
  }

  function validate() {
    if (!String(state.profile.basic.name || '').trim()) {
      return '姓名是必填项，请先在「基本信息」里填写。';
    }
    for (var i = 0; i < SECTIONS.length; i += 1) {
      var section = SECTIONS[i];
      var meta = SECTION_META[section];
      var required = meta.fields.filter(function (f) { return f.required; })[0];
      var list = state.profile[section];
      for (var j = 0; j < list.length; j += 1) {
        if (!String(list[j][required.key] || '').trim()) {
          return meta.label + ' 第 ' + (j + 1) + ' 条的「' + required.label + '」还没填。';
        }
      }
    }
    return '';
  }

  function exportJson() {
    var problem = validate();
    if (problem) { toast(problem); return; }

    var text = buildJson();
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('已导出 data.json，替换仓库里的同名文件后提交即可');
  }

  function bindExport() {
    $('#export-btn').addEventListener('click', exportJson);
  }

  function bindImport() {
    var modal = $('#import-modal');
    var textarea = $('#import-text');
    var errorBox = $('#import-error');

    $('#import-btn').addEventListener('click', function () {
      textarea.value = '';
      errorBox.hidden = true;
      modal.hidden = false;
      textarea.focus();
    });

    $('#import-cancel').addEventListener('click', function () { modal.hidden = true; });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.hidden = true;
    });

    $('#import-confirm').addEventListener('click', function () {
      var raw = textarea.value.trim();
      if (!raw) {
        errorBox.textContent = '请先粘贴 JSON 内容。';
        errorBox.hidden = false;
        return;
      }
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        errorBox.textContent = '这段内容不是合法的 JSON：' + err.message;
        errorBox.hidden = false;
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        errorBox.textContent = 'JSON 顶层应该是一个对象。';
        errorBox.hidden = false;
        return;
      }
      state.profile = normalize(parsed);
      saveDraftNow();
      renderAll();
      modal.hidden = true;
      toast('已导入，记得导出后提交');
    });
  }

  function bindReset() {
    $('#reset-btn').addEventListener('click', function () {
      if (!window.confirm('放弃本机草稿，重新从 data.json 读取？当前未导出的改动会丢失。')) return;
      try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
      loadFromServer();
    });
  }

  /* ---------------- 启动 ---------------- */

  function loadFromServer() {
    setStatus('正在读取 data.json…');
    return fetch('data.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.profile = normalize(data);
        renderAll();
        setStatus('已从 data.json 读取');
      })
      .catch(function (err) {
        setStatus('读取 data.json 失败');
        toast('读取 data.json 失败：' + err.message);
      });
  }

  function boot() {
    bindNav();
    bindBasic();
    bindLists();
    bindExport();
    bindImport();
    bindReset();

    var draft = readDraft();
    if (draft) {
      state.profile = normalize(draft);
      renderAll();
      setStatus('已恢复本机草稿');
    } else {
      loadFromServer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
