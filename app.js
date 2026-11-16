/* 前台：读取同目录 data.json 并渲染档案（纯静态，无后端） */

(function () {
  'use strict';

  var page = document.getElementById('page');
  var loading = document.getElementById('loading');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function period(start, end) {
    var parts = [start, end].filter(Boolean);
    return parts.length ? parts.join(' – ') : '';
  }

  function paragraphs(text) {
    return String(text || '')
      .split(/\n{2,}/)
      .map(function (block) { return block.trim(); })
      .filter(Boolean)
      .map(function (block) { return '<p>' + esc(block).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function bullets(text) {
    var lines = String(text || '')
      .split('\n')
      .map(function (line) { return line.replace(/^[-·•]\s*/, '').trim(); })
      .filter(Boolean);
    if (!lines.length) return '';
    return '<ul class="bullets">' + lines.map(function (line) {
      return '<li>' + esc(line) + '</li>';
    }).join('') + '</ul>';
  }

  function linkOf(value) {
    if (!value) return '';
    return /^(https?:|mailto:)/i.test(value) ? value : 'https://' + value;
  }

  function renderContact(basic) {
    var items = [];
    if (basic.email) items.push('<li><a href="mailto:' + esc(basic.email) + '">' + esc(basic.email) + '</a></li>');
    if (basic.phone) items.push('<li>' + esc(basic.phone) + '</li>');
    if (basic.city) items.push('<li>' + esc(basic.city) + '</li>');
    if (basic.website) items.push('<li><a href="' + esc(linkOf(basic.website)) + '" target="_blank" rel="noopener">' + esc(String(basic.website).replace(/^https?:\/\//, '')) + '</a></li>');
    if (basic.github) items.push('<li><a href="' + esc(linkOf(basic.github)) + '" target="_blank" rel="noopener">' + esc(String(basic.github).replace(/^https?:\/\//, '')) + '</a></li>');
    return items.length ? '<ul class="contact">' + items.join('') + '</ul>' : '';
  }

  function section(title, bodyHtml) {
    return '<section class="block">' +
      '<h2 class="block-title">' + esc(title) + '</h2>' +
      '<div class="block-body">' + bodyHtml + '</div>' +
      '</section>';
  }

  function renderEducation(list) {
    if (!list.length) return section('教育经历', '<p class="empty">暂无内容</p>');
    var html = list.map(function (item) {
      var sub = [item.degree, item.major].filter(Boolean).join(' · ');
      return '<article class="entry">' +
        '<div class="entry-head">' +
          '<span class="entry-title">' + esc(item.school) + '</span>' +
          '<span class="entry-period">' + esc(period(item.start, item.end)) + '</span>' +
        '</div>' +
        (sub ? '<p class="entry-sub">' + esc(sub) + '</p>' : '') +
        (item.note ? '<p class="entry-note">' + esc(item.note).replace(/\n/g, '<br>') + '</p>' : '') +
        '</article>';
    }).join('');
    return section('教育经历', html);
  }

  function renderExperience(list) {
    if (!list.length) return section('工作经历', '<p class="empty">暂无内容</p>');
    var html = list.map(function (item) {
      return '<article class="entry">' +
        '<div class="entry-head">' +
          '<span class="entry-title">' + esc(item.company) + '</span>' +
          '<span class="entry-period">' + esc(period(item.start, item.end)) + '</span>' +
        '</div>' +
        (item.role ? '<p class="entry-sub">' + esc(item.role) + '</p>' : '') +
        bullets(item.note) +
        '</article>';
    }).join('');
    return section('工作经历', html);
  }

  function renderAwards(list) {
    if (!list.length) return section('奖项与荣誉', '<p class="empty">暂无内容</p>');
    var html = list.map(function (item) {
      return '<div class="award">' +
        '<div class="award-date">' + esc(item.date || '—') + '</div>' +
        '<div>' +
          '<div class="award-title">' + esc(item.title) + '</div>' +
          (item.org ? '<div class="award-org">' + esc(item.org) + '</div>' : '') +
          (item.note ? '<p class="award-note">' + esc(item.note) + '</p>' : '') +
        '</div>' +
        '</div>';
    }).join('');
    return section('奖项与荣誉', html);
  }

  function renderSkills(list) {
    if (!list.length) return section('专业技能', '<p class="empty">暂无内容</p>');
    var html = list.map(function (item) {
      return '<div class="skill">' +
        '<div class="skill-group">' + esc(item.group) + '</div>' +
        '<p class="skill-items">' + esc(String(item.items || '').replace(/\n/g, '、')) + '</p>' +
        '</div>';
    }).join('');
    return section('专业技能', html);
  }

  function formatDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日';
  }

  function render(data) {
    var basic = data.basic || {};
    var html = '';

    html += '<header class="masthead">';
    html += '<div class="masthead-main">';
    html += '<h1 class="name">' + esc(basic.name || '未命名') + '</h1>';
    if (basic.title) html += '<p class="title-line">' + esc(basic.title) + '</p>';
    html += renderContact(basic);
    if (basic.summary) html += '<div class="summary">' + paragraphs(basic.summary) + '</div>';
    html += '</div>';
    if (basic.avatar) {
      html += '<img class="portrait" src="' + esc(basic.avatar) + '" alt="' + esc(basic.name || '') +
        '" loading="lazy" onerror="this.remove()">';
    }
    html += '</header>';

    html += renderEducation(data.education || []);
    html += renderExperience(data.experience || []);
    html += renderAwards(data.awards || []);
    html += renderSkills(data.skills || []);

    var updated = formatDate(data.updatedAt);
    html += '<footer class="site-footer">' +
      '<span>' + (updated ? '最后更新：' + esc(updated) : '') + '</span>' +
      '<span class="footer-actions no-print">' +
        '<button type="button" class="linklike" id="print-btn">打印 / 存为 PDF</button>' +
        '<a class="linklike" href="edit.html">编辑</a>' +
      '</span>' +
      '</footer>';

    page.innerHTML = html;
    page.hidden = false;
    loading.hidden = true;

    var printBtn = document.getElementById('print-btn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    if (basic.name) document.title = basic.name + ' · 个人档案';
  }

  fetch('data.json', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(render)
    .catch(function (err) {
      loading.innerHTML = '内容读取失败。请确认 <code>data.json</code> 与页面在同一目录，' +
        '并且是通过 HTTP 访问（直接双击打开本地文件会被浏览器拦截）。';
      console.error(err);
    });
})();
