/* 后台管理逻辑：登录态检测、基础信息保存、分区记录增删改与排序 */

(function () {
  'use strict';

  var state = { profile: null, user: null };

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
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function api(method, url, body) {
    var options = {
      method: method,
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          showLogin();
          throw new Error(data.error || '登录状态已失效，请重新登录。');
        }
        if (!res.ok) throw new Error(data.error || ('请求失败（' + res.status + '）'));
        return data;
      });
    });
  }

  /* ---------------- 视图切换 ---------------- */

  function showLogin() {
    $('#login-view').hidden = false;
    $('#admin-view').hidden = true;
    var userInput = $('#login-user');
    if (userInput && !userInput.value) userInput.focus();
  }

  function showAdmin(user) {
    $('#login-view').hidden = true;
    $('#admin-view').hidden = false;
    $('#who').textContent = user ? '已登录：' + user : '';
  }

  /* ---------------- 登录 ---------------- */

  function bindLogin() {
    var form = $('#login-form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errorBox = $('#login-error');
      var submit = $('#login-submit');
      errorBox.hidden = true;

      var username = $('#login-user').value.trim();
      var password = $('#login-pass').value;
      if (!username || !password) {
        errorBox.textContent = '请填写用户名和密码。';
        errorBox.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = '登录中…';

      api('POST', '/api/login', { username: username, password: password })
        .then(function (data) {
          $('#login-pass').value = '';
          state.user = data.user;
          showAdmin(data.user);
          return loadProfile();
        })
        .catch(function (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = '登录';
        });
    });
  }

  function bindLogout() {
    $('#logout-btn').addEventListener('click', function () {
      api('POST', '/api/logout').then(function () {
        state.profile = null;
        state.user = null;
        showLogin();
      }).catch(function (err) {
        toast(err.message);
      });
    });
  }

  /* ---------------- 导航 ---------------- */

  function bindNav() {
    $$('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.dataset.target;
        $$('.nav-item').forEach(function (item) {
          item.classList.toggle('is-active', item === btn);
        });
        $$('.panel').forEach(function (panel) {
          panel.classList.toggle('is-active', panel.dataset.panel === target);
        });
      });
    });
  }

  /* ---------------- 基本信息 ---------------- */

  function fillBasic(basic) {
    var form = $('#basic-form');
    Object.keys(basic || {}).forEach(function (key) {
      var field = form.elements[key];
      if (field) field.value = basic[key] == null ? '' : basic[key];
    });
  }

  function bindBasic() {
    var form = $('#basic-form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var payload = {};
      ['name', 'title', 'summary', 'email', 'phone', 'city', 'website', 'github', 'avatar']
        .forEach(function (key) {
          var field = form.elements[key];
          if (field) payload[key] = field.value.trim();
        });

      if (!payload.name) {
        toast('姓名不能为空。');
        form.elements.name.focus();
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = '保存中…';

      api('PUT', '/api/profile', { basic: payload })
        .then(function (data) {
          state.profile.basic = data.basic;
          state.profile.updatedAt = data.updatedAt;
          renderUpdatedAt();
          $('#basic-note').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
          toast('基本信息已保存');
        })
        .catch(function (err) { toast(err.message); })
        .finally(function () {
          button.disabled = false;
          button.textContent = '保存基本信息';
        });
    });
  }

  /* ---------------- 记录列表 ---------------- */

  function fieldHtml(section, field, value) {
    var id = 'f-' + section + '-' + Math.random().toString(36).slice(2, 8) + '-' + field.key;
    var label = '<span class="field-label">' + esc(field.label) + (field.required ? ' <em>必填</em>' : '') + '</span>';
    var common = 'id="' + id + '" data-key="' + field.key + '" maxlength="' + field.max + '"' +
      (field.required ? ' required' : '') +
      ' placeholder="' + esc(field.placeholder || '') + '"';

    var control;
    if (field.type === 'textarea') {
      control = '<textarea ' + common + ' rows="' + (field.rows || 4) + '">' + esc(value) + '</textarea>';
    } else {
      control = '<input type="text" ' + common + ' value="' + esc(value) + '">';
    }
    var hint = field.hint ? '<span class="field-hint">' + esc(field.hint) + '</span>' : '';
    return '<label class="field" for="' + id + '">' + label + control + hint + '</label>';
  }

  function itemHtml(section, item, index, total) {
    var meta = SECTION_META[section];
    var summaryMain = item[meta.primary] || '（未填写）';

    var subParts = [];
    if (section === 'education') subParts = [item.degree, item.major];
    else if (section === 'experience') subParts = [item.role];
    else if (section === 'awards') subParts = [item.org, item.date];
    else if (section === 'skills') subParts = [];
    var sub = subParts.filter(Boolean).join(' · ');

    var body = meta.fields.map(function (field) {
      return fieldHtml(section, field, item[field.key] || '');
    }).join('');

    // 两列字段（half）需要包一层 grid，交给 CSS 处理
    var html = '';
    html += '<article class="item" data-id="' + esc(item.id) + '">';
    html += '<div class="item-head">';
    html += '<span class="item-summary">' + esc(summaryMain) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
    html += '<span class="item-tools">';
    html += '<button type="button" class="btn btn-sm btn-ghost" data-act="up"' + (index === 0 ? ' disabled' : '') + ' title="上移">↑</button>';
    html += '<button type="button" class="btn btn-sm btn-ghost" data-act="down"' + (index === total - 1 ? ' disabled' : '') + ' title="下移">↓</button>';
    html += '<button type="button" class="btn btn-sm" data-act="toggle">编辑</button>';
    html += '</span>';
    html += '</div>';
    html += '<div class="item-body">';
    html += '<div class="grid-2">' + body + '</div>';
    html += '<div class="item-actions">';
    html += '<button type="button" class="btn btn-danger btn-sm" data-act="delete">删除这条</button>';
    html += '<span class="spacer"></span>';
    html += '<button type="button" class="btn btn-sm" data-act="cancel">收起</button>';
    html += '<button type="button" class="btn btn-primary btn-sm" data-act="save">保存</button>';
    html += '</div>';
    html += '</div>';
    html += '</article>';
    return html;
  }

  function renderSection(section) {
    var meta = SECTION_META[section];
    var list = (state.profile && state.profile[section]) || [];
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
    fillBasic(state.profile.basic);
    Object.keys(SECTION_META).forEach(renderSection);
    renderUpdatedAt();
  }

  function renderUpdatedAt() {
    var iso = state.profile && state.profile.updatedAt;
    var el = $('#updated-at');
    if (!el) return;
    if (!iso) { el.textContent = ''; return; }
    var date = new Date(iso);
    if (isNaN(date.getTime())) { el.textContent = ''; return; }
    el.textContent = '最后更新\n' + date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  function collectItem(card) {
    var payload = {};
    $$('[data-key]', card).forEach(function (input) {
      payload[input.dataset.key] = input.value.trim();
    });
    return payload;
  }

  function bindLists() {
    Object.keys(SECTION_META).forEach(function (section) {
      var addBtn = document.querySelector('[data-add="' + section + '"]');
      if (addBtn) {
        addBtn.addEventListener('click', function () { addItem(section); });
      }
    });

    // 事件委托：卡片内所有操作
    document.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      var card = btn.closest('.item');
      if (!card) return;

      var panel = btn.closest('.panel');
      var section = panel ? panel.dataset.panel : null;
      if (!section) return;

      var id = card.dataset.id;
      var act = btn.dataset.act;

      if (act === 'toggle') {
        var open = card.classList.toggle('is-open');
        btn.textContent = open ? '收起' : '编辑';
      } else if (act === 'cancel') {
        // 放弃修改：用已保存数据重绘该条
        var item = (state.profile[section] || []).find(function (entry) { return entry.id === id; });
        if (item) {
          var index = state.profile[section].indexOf(item);
          card.outerHTML = itemHtml(section, item, index, state.profile[section].length);
        }
      } else if (act === 'save') {
        saveItem(section, id, collectItem(card), btn);
      } else if (act === 'delete') {
        deleteItem(section, id);
      } else if (act === 'up' || act === 'down') {
        moveItem(section, id, act);
      }
    });
  }

  function addItem(section) {
    var meta = SECTION_META[section];
    var blank = { id: '' };
    meta.fields.forEach(function (field) { blank[field.key] = ''; });

    // 先在本地插一条空记录，展开让用户填
    var tempItem = Object.assign({ id: 'new-' + Date.now() }, blank);
    state.profile[section] = state.profile[section] || [];
    state.profile[section].push(tempItem);
    renderSection(section);

    var card = document.querySelector('[data-id="' + tempItem.id + '"]');
    if (!card) return;
    card.classList.add('is-open');
    var toggle = card.querySelector('[data-act="toggle"]');
    if (toggle) toggle.textContent = '收起';

    // 新建模式：保存按钮改为“添加”
    var saveBtn = card.querySelector('[data-act="save"]');
    if (saveBtn) {
      saveBtn.textContent = '添加';
      saveBtn.dataset.mode = 'create';
    }
    var delBtn = card.querySelector('[data-act="delete"]');
    if (delBtn) {
      delBtn.textContent = '取消添加';
      delBtn.dataset.mode = 'discard';
    }

    // 重写该卡片的事件处理：用 create 逻辑
    bindNewCard(card, section, tempItem.id);

    var firstInput = card.querySelector('input, textarea');
    if (firstInput) firstInput.focus();
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bindNewCard(card, section, tempId) {
    var saveBtn = card.querySelector('[data-act="save"]');
    var delBtn = card.querySelector('[data-act="delete"]');

    var newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    var newDel = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(newDel, delBtn);

    newSave.addEventListener('click', function () {
      var payload = collectItem(card);
      var meta = SECTION_META[section];
      var requiredField = meta.fields.filter(function (f) { return f.required; })[0];
      if (requiredField && !payload[requiredField.key]) {
        toast(requiredField.label + '不能为空。');
        return;
      }
      newSave.disabled = true;
      newSave.textContent = '添加中…';

      api('POST', '/api/' + section, payload)
        .then(function (data) {
          // 移除本地临时记录，插入服务器返回的真实记录
          var list = state.profile[section] || [];
          var index = list.findIndex(function (entry) { return entry.id === tempId; });
          if (index >= 0) list[index] = data.item;
          else list.push(data.item);
          state.profile.updatedAt = data.updatedAt;
          renderSection(section);
          renderUpdatedAt();
          toast('已添加');
        })
        .catch(function (err) {
          newSave.disabled = false;
          newSave.textContent = '添加';
          toast(err.message);
        });
    });

    newDel.addEventListener('click', function () {
      var list = state.profile[section] || [];
      var index = list.findIndex(function (entry) { return entry.id === tempId; });
      if (index >= 0) list.splice(index, 1);
      renderSection(section);
      toast('已取消');
    });
  }

  function saveItem(section, id, payload, button) {
    var meta = SECTION_META[section];
    var requiredField = meta.fields.filter(function (f) { return f.required; })[0];
    if (requiredField && !payload[requiredField.key]) {
      toast(requiredField.label + '不能为空。');
      return;
    }

    button.disabled = true;
    button.textContent = '保存中…';

    api('PUT', '/api/' + section + '/' + encodeURIComponent(id), payload)
      .then(function (data) {
        var list = state.profile[section] || [];
        var index = list.findIndex(function (entry) { return entry.id === id; });
        if (index >= 0) list[index] = data.item;
        state.profile.updatedAt = data.updatedAt;
        renderSection(section);
        renderUpdatedAt();
        toast('已保存');
      })
      .catch(function (err) {
        toast(err.message);
      })
      .finally(function () {
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = '保存';
        }
      });
  }

  function deleteItem(section, id) {
    var list = state.profile[section] || [];
    var item = list.find(function (entry) { return entry.id === id; });
    var meta = SECTION_META[section];
    var name = item ? (item[meta.primary] || meta.label) : meta.label;
    if (!window.confirm('确定删除「' + name + '」吗？此操作无法撤销。')) return;

    api('DELETE', '/api/' + section + '/' + encodeURIComponent(id))
      .then(function (data) {
        state.profile[section] = list.filter(function (entry) { return entry.id !== id; });
        state.profile.updatedAt = data.updatedAt;
        renderSection(section);
        renderUpdatedAt();
        toast('已删除');
      })
      .catch(function (err) { toast(err.message); });
  }

  function moveItem(section, id, direction) {
    api('POST', '/api/' + section + '/' + encodeURIComponent(id) + '/move', { direction: direction })
      .then(function (data) {
        var list = state.profile[section] || [];
        var index = list.findIndex(function (entry) { return entry.id === id; });
        var target = direction === 'up' ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < list.length) {
          var moved = list.splice(index, 1)[0];
          list.splice(target, 0, moved);
        }
        state.profile.updatedAt = data.updatedAt;
        renderSection(section);
        renderUpdatedAt();
      })
      .catch(function (err) { toast(err.message); });
  }

  /* ---------------- 修改密码 ---------------- */

  function bindPassword() {
    var modal = $('#pass-modal');
    var form = $('#pass-form');

    $('#change-pass-btn').addEventListener('click', function () {
      form.reset();
      $('#pass-error').hidden = true;
      modal.hidden = false;
      form.elements.current.focus();
    });

    $('#pass-cancel').addEventListener('click', function () { modal.hidden = true; });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.hidden = true;
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errorBox = $('#pass-error');
      errorBox.hidden = true;
      var current = form.elements.current.value;
      var next = form.elements.next.value;

      if (next.length < 8) {
        errorBox.textContent = '新密码至少 8 位。';
        errorBox.hidden = false;
        return;
      }

      api('POST', '/api/password', { current: current, next: next })
        .then(function () {
          modal.hidden = true;
          toast('密码已修改，请重新登录');
          state.profile = null;
          state.user = null;
          showLogin();
        })
        .catch(function (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        });
    });
  }

  /* ---------------- 启动 ---------------- */

  function loadProfile() {
    return api('GET', '/api/profile').then(function (data) {
      state.profile = data;
      renderAll();
      return data;
    });
  }

  function boot() {
    bindLogin();
    bindLogout();
    bindNav();
    bindBasic();
    bindLists();
    bindPassword();

    api('GET', '/api/session')
      .then(function (data) {
        if (data.loggedIn) {
          state.user = data.user;
          showAdmin(data.user);
          return loadProfile();
        }
        showLogin();
      })
      .catch(function () {
        showLogin();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
