/* 법정선임관리 시스템
 * - 정적 사이트(GitHub Pages)라 서버/DB가 없으므로, 데이터는 브라우저(localStorage)에만 저장됩니다.
 * - 사업소 <-> 본사 간 데이터 전달은 JSON 내보내기/가져오기로 처리합니다.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'legalAppointments.v1';
  var COMPANY_NAME = '에이스종합관리(주)';
  var CATEGORY_SUGGESTIONS = ['기계', '전기', '소방', '가스', '정보통신', '에너지', '산업안전', '개인정보'];

  var root = document.getElementById('legal-app');
  if (!root) return;

  /* ---------------- 데이터 저장/로드 ---------------- */

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('법정선임관리: 저장된 데이터를 읽지 못했습니다.', e);
    }
    return null;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('법정선임관리: 저장 실패', e);
    }
  }

  function seedDemoData() {
    var siteName = '샘플 사업소(예시)';
    var rows = [
      { category: '기계', subject: '수도시설관리자(건축물관리자)', criterion: '', appointee: '홍길동', appointedDate: '2024-11-20', reportDeadline: '30일 이내', termYears: 5, nextEducationDate: '2025-03-18', authority: '한국환경보전원', notes: '선임 후 1년 이내 교육 이수 필요' },
      { category: '전기', subject: '전기안전관리자', criterion: '', appointee: '김안전', appointedDate: '2024-09-05', reportDeadline: '30일 이내', termYears: 3, nextEducationDate: '2025-09-05', authority: '한국전기기술인협회', notes: '선임 후 6개월 이내 교육' },
      { category: '소방', subject: '소방안전관리자', criterion: '15,000㎡ 이상 특정소방대상물', appointee: '이소방', appointedDate: '2026-04-08', reportDeadline: '14일 이내 신고', termYears: 2, nextEducationDate: '2026-08-20', authority: '관할소방서 예방과', notes: '최초 교육 이후 2년마다 재교육' },
      { category: '산업안전', subject: '산업안전관리감독자', criterion: '', appointee: '박관리', appointedDate: '2024-09-01', reportDeadline: '', termYears: 1, nextEducationDate: '2025-11-14', authority: '대한산업안전협회', notes: '' }
    ];
    rows.forEach(function (r) { r.id = uid(); });
    var s = {};
    s[siteName] = rows;
    return { activeSite: siteName, sites: s };
  }

  var state = loadState() || seedDemoData();
  if (!state.sites) state.sites = {};
  if (!state.activeSite || !state.sites[state.activeSite]) {
    var firstSite = Object.keys(state.sites)[0];
    state.activeSite = firstSite || null;
  }

  /* ---------------- 날짜 / D-day 계산 ---------------- */

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function addYears(date, years) {
    if (!date || !years) return null;
    var d = new Date(date.getTime());
    d.setFullYear(d.getFullYear() + Number(years));
    return d;
  }

  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysBetween(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function fmtDate(d) {
    if (!d) return '';
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  }

  // 항목의 "다음 기준일"과 상태(정상/주의/임박/만료/없음)를 계산
  function computeDeadline(row) {
    var appointed = parseDate(row.appointedDate);
    var termEnd = row.termYears ? addYears(appointed, row.termYears) : null;
    var eduDue = parseDate(row.nextEducationDate);

    var candidates = [termEnd, eduDue].filter(Boolean);
    if (!candidates.length) return { date: null, daysLeft: null, status: 'none', label: '기한 없음' };

    var deadline = candidates.reduce(function (a, b) { return a < b ? a : b; });
    var daysLeft = daysBetween(today(), deadline);

    var status, label;
    if (daysLeft < 0) { status = 'expired'; label = '만료 D+' + Math.abs(daysLeft); }
    else if (daysLeft <= 30) { status = 'urgent'; label = 'D-' + daysLeft; }
    else if (daysLeft <= 90) { status = 'caution'; label = 'D-' + daysLeft; }
    else { status = 'normal'; label = 'D-' + daysLeft; }

    return { date: deadline, daysLeft: daysLeft, status: status, label: label };
  }

  var STATUS_TEXT = { normal: '정상', caution: '주의', urgent: '임박', expired: '만료', none: '기한 없음' };

  /* ---------------- 공통 유틸 ---------------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function allSiteNames() {
    return Object.keys(state.sites).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  function allRowsFlat() {
    var out = [];
    Object.keys(state.sites).forEach(function (site) {
      state.sites[site].forEach(function (row) { out.push({ site: site, row: row }); });
    });
    return out;
  }

  function downloadJson(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---------------- 상태(탭/필터) ---------------- */

  var ui = {
    tab: 'admin',
    admin: { site: '__all__', category: '__all__', status: '__all__', q: '' },
    siteTab: { site: state.activeSite }
  };

  /* ---------------- 렌더링 ---------------- */

  function render() {
    root.innerHTML =
      '<div class="legal-tabs no-print">' +
        '<button class="legal-tab-btn' + (ui.tab === 'admin' ? ' is-active' : '') + '" data-tab="admin">🏢 본사 관리자</button>' +
        '<button class="legal-tab-btn' + (ui.tab === 'site' ? ' is-active' : '') + '" data-tab="site">📋 사업소 보고</button>' +
      '</div>' +
      '<div class="legal-tab-panel' + (ui.tab === 'admin' ? ' is-active' : '') + '" id="legal-panel-admin"></div>' +
      '<div class="legal-tab-panel' + (ui.tab === 'site' ? ' is-active' : '') + '" id="legal-panel-site"></div>';

    document.querySelectorAll('.legal-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { ui.tab = btn.getAttribute('data-tab'); render(); });
    });

    if (ui.tab === 'admin') renderAdmin(document.getElementById('legal-panel-admin'));
    else renderSite(document.getElementById('legal-panel-site'));
  }

  /* ---- 본사 관리자 탭 ---- */

  function renderAdmin(panel) {
    var flat = allRowsFlat();
    var withDeadline = flat.map(function (item) {
      return { site: item.site, row: item.row, dl: computeDeadline(item.row) };
    });

    var urgentCount = withDeadline.filter(function (i) { return i.dl.status === 'urgent'; }).length;
    var cautionCount = withDeadline.filter(function (i) { return i.dl.status === 'caution'; }).length;
    var expiredCount = withDeadline.filter(function (i) { return i.dl.status === 'expired'; }).length;

    var sites = allSiteNames();
    var categories = Array.from(new Set(flat.map(function (i) { return i.row.category; }).filter(Boolean))).sort();

    var filtered = withDeadline.filter(function (i) {
      if (ui.admin.site !== '__all__' && i.site !== ui.admin.site) return false;
      if (ui.admin.category !== '__all__' && i.row.category !== ui.admin.category) return false;
      if (ui.admin.status !== '__all__' && i.dl.status !== ui.admin.status) return false;
      if (ui.admin.q) {
        var q = ui.admin.q.toLowerCase();
        var hay = [i.row.appointee, i.row.subject, i.row.notes, i.row.authority].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      var da = a.dl.daysLeft, db = b.dl.daysLeft;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

    panel.innerHTML =
      '<div class="legal-notice no-print"><strong>안내:</strong> 이 시스템은 정적 사이트에서 동작하며, 데이터는 이 브라우저에만 저장됩니다(다른 기기와 자동 동기화되지 않습니다). ' +
        '사업소가 <strong>사업소 보고</strong> 탭에서 내보낸 JSON 파일을 아래 "사업소 데이터 가져오기"로 불러와 본사 현황에 합칠 수 있습니다.</div>' +

      '<div class="legal-cards">' +
        '<div class="legal-card"><span class="legal-card-num">' + sites.length + '</span><span class="legal-card-label">전체 사업소</span></div>' +
        '<div class="legal-card"><span class="legal-card-num">' + flat.length + '</span><span class="legal-card-label">전체 선임 항목</span></div>' +
        '<div class="legal-card is-caution"><span class="legal-card-num">' + cautionCount + '</span><span class="legal-card-label">주의(D-90 이내)</span></div>' +
        '<div class="legal-card is-urgent"><span class="legal-card-num">' + urgentCount + '</span><span class="legal-card-label">임박(D-30 이내)</span></div>' +
        '<div class="legal-card is-expired"><span class="legal-card-num">' + expiredCount + '</span><span class="legal-card-label">만료</span></div>' +
      '</div>' +

      '<div class="legal-toolbar no-print">' +
        selectHtml('legal-admin-site', ['__all__'].concat(sites), ui.admin.site, function (v) { return v === '__all__' ? '전체 사업소' : v; }) +
        selectHtml('legal-admin-category', ['__all__'].concat(categories), ui.admin.category, function (v) { return v === '__all__' ? '전체 분야' : v; }) +
        selectHtml('legal-admin-status', ['__all__', 'urgent', 'caution', 'normal', 'expired', 'none'], ui.admin.status, function (v) { return v === '__all__' ? '전체 상태' : STATUS_TEXT[v]; }) +
        '<input type="search" id="legal-admin-q" placeholder="선임자·비고 검색" value="' + escapeHtml(ui.admin.q) + '">' +
        '<div class="legal-spacer"></div>' +
        '<label class="legal-btn legal-btn--outline legal-file-btn">사업소 데이터 가져오기<input type="file" id="legal-admin-import" accept="application/json"></label>' +
        '<button class="legal-btn legal-btn--outline" id="legal-admin-export">전체 내보내기(백업)</button>' +
      '</div>' +

      renderTable(filtered, { showSite: true, editable: true }) +
      '<p class="no-print" style="margin-top:.8rem;font-size:.8rem;color:#8b96a8;">정렬 기준: 다음 기준일이 임박한 순서입니다.</p>';

    // 이벤트 연결
    byId('legal-admin-site').addEventListener('change', function (e) { ui.admin.site = e.target.value; render(); });
    byId('legal-admin-category').addEventListener('change', function (e) { ui.admin.category = e.target.value; render(); });
    byId('legal-admin-status').addEventListener('change', function (e) { ui.admin.status = e.target.value; render(); });
    byId('legal-admin-q').addEventListener('input', function (e) { ui.admin.q = e.target.value; render(); });
    byId('legal-admin-export').addEventListener('click', function () {
      downloadJson('법정선임관리-전체백업-' + fmtDate(today()) + '.json', state);
    });
    byId('legal-admin-import').addEventListener('change', function (e) { handleAdminImport(e.target.files[0]); });

    bindRowActions(panel, { showSite: true });
  }

  function handleAdminImport(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        // 사업소 보고 탭에서 내보낸 단일 사업소 파일: { site, rows }
        // 전체 백업 파일: { sites: {...} }
        if (data && data.site && Array.isArray(data.rows)) {
          data.rows.forEach(function (r) { if (!r.id) r.id = uid(); });
          state.sites[data.site] = data.rows;
        } else if (data && data.sites) {
          Object.keys(data.sites).forEach(function (site) {
            state.sites[site] = data.sites[site];
          });
        } else {
          alert('인식할 수 없는 파일 형식입니다.');
          return;
        }
        saveState();
        render();
        alert('가져오기가 완료되었습니다.');
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---- 사업소 보고 탭 ---- */

  function renderSite(panel) {
    var sites = allSiteNames();
    if (!ui.siteTab.site || sites.indexOf(ui.siteTab.site) === -1) ui.siteTab.site = sites[0] || null;
    var site = ui.siteTab.site;
    var rows = site ? state.sites[site] : [];

    var withDeadline = (rows || []).map(function (row) { return { row: row, dl: computeDeadline(row) }; });
    withDeadline.sort(function (a, b) {
      var da = a.dl.daysLeft, db = b.dl.daysLeft;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

    panel.innerHTML =
      '<div class="legal-site-picker no-print">' +
        '<select id="legal-site-select">' +
          sites.map(function (s) { return '<option value="' + escapeHtml(s) + '"' + (s === site ? ' selected' : '') + '>' + escapeHtml(s) + '</option>'; }).join('') +
        '</select>' +
        '<button class="legal-btn legal-btn--outline legal-btn--sm" id="legal-site-new">+ 새 사업소 등록</button>' +
        (site ? '<button class="legal-btn legal-btn--outline legal-btn--sm" id="legal-site-rename">이름 변경</button><button class="legal-btn legal-btn--danger legal-btn--sm" id="legal-site-delete">사업소 삭제</button>' : '') +
      '</div>' +

      (site ?
        '<div class="legal-report-head">' +
          '<p style="margin:0;color:#6b7688;font-size:.85rem;">' + escapeHtml(COMPANY_NAME) + ' · 법정 선임 자격자 현황</p>' +
          '<h3>' + escapeHtml(site) + '</h3>' +
          '<p>기준일: ' + fmtDate(today()) + '</p>' +
        '</div>' +

        '<div class="legal-toolbar no-print">' +
          '<button class="legal-btn" id="legal-site-add-row">+ 항목 추가</button>' +
          '<div class="legal-spacer"></div>' +
          '<button class="legal-btn legal-btn--outline" id="legal-site-print">보고서 인쇄</button>' +
          '<button class="legal-btn legal-btn--outline" id="legal-site-export">본사로 보낼 파일 내보내기(JSON)</button>' +
          '<label class="legal-btn legal-btn--outline legal-file-btn">불러오기<input type="file" id="legal-site-import" accept="application/json"></label>' +
        '</div>' +

        renderTable(withDeadline.map(function (i) { return { site: site, row: i.row, dl: i.dl }; }), { showSite: false, editable: true })
      : '<div class="legal-empty">등록된 사업소가 없습니다. "새 사업소 등록"으로 시작하세요.</div>');

    byId('legal-site-select') && byId('legal-site-select').addEventListener('change', function (e) {
      ui.siteTab.site = e.target.value; render();
    });
    byId('legal-site-new').addEventListener('click', function () {
      var name = prompt('새 사업소 이름을 입력하세요.');
      if (!name) return;
      if (state.sites[name]) { alert('이미 존재하는 사업소입니다.'); return; }
      state.sites[name] = [];
      ui.siteTab.site = name;
      saveState(); render();
    });
    if (site) {
      byId('legal-site-rename').addEventListener('click', function () {
        var name = prompt('새 이름을 입력하세요.', site);
        if (!name || name === site) return;
        if (state.sites[name]) { alert('이미 존재하는 이름입니다.'); return; }
        state.sites[name] = state.sites[site];
        delete state.sites[site];
        ui.siteTab.site = name;
        if (state.activeSite === site) state.activeSite = name;
        saveState(); render();
      });
      byId('legal-site-delete').addEventListener('click', function () {
        if (!confirm('"' + site + '" 사업소와 모든 항목을 삭제할까요? 되돌릴 수 없습니다.')) return;
        delete state.sites[site];
        ui.siteTab.site = null;
        saveState(); render();
      });
      byId('legal-site-add-row').addEventListener('click', function () { openRowModal(site, null); });
      byId('legal-site-print').addEventListener('click', function () { window.print(); });
      byId('legal-site-export').addEventListener('click', function () {
        downloadJson(site + '-법정선임현황-' + fmtDate(today()) + '.json', { site: site, rows: state.sites[site] });
      });
      byId('legal-site-import').addEventListener('change', function (e) { handleSiteImport(site, e.target.files[0]); });
      bindRowActions(panel, { showSite: false });
    }
  }

  function handleSiteImport(site, file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : null);
        if (!rows) { alert('인식할 수 없는 파일 형식입니다.'); return; }
        rows.forEach(function (r) { if (!r.id) r.id = uid(); });
        state.sites[site] = rows;
        saveState(); render();
        alert('불러오기가 완료되었습니다.');
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---- 공통: 셀렉트/테이블/행 액션 ---- */

  function selectHtml(id, values, current, labelFn) {
    return '<select id="' + id + '">' +
      values.map(function (v) {
        return '<option value="' + escapeHtml(v) + '"' + (v === current ? ' selected' : '') + '>' + escapeHtml(labelFn(v)) + '</option>';
      }).join('') +
      '</select>';
  }

  function byId(id) { return document.getElementById(id); }

  function renderTable(items, opts) {
    if (!items.length) return '<div class="legal-empty">표시할 항목이 없습니다.</div>';
    var head =
      '<tr>' +
        (opts.showSite ? '<th>사업소</th>' : '') +
        '<th>분야</th><th>대상/기준</th><th>선임자</th><th>선임일</th><th>선임기간</th>' +
        '<th>다음 기준일</th><th>상태</th><th>선임기관</th><th class="legal-col-notes">비고</th>' +
        (opts.editable ? '<th class="no-print">관리</th>' : '') +
      '</tr>';

    var body = items.map(function (item) {
      var row = item.row, dl = item.dl || computeDeadline(row);
      return '<tr data-site="' + escapeHtml(item.site) + '" data-id="' + escapeHtml(row.id) + '">' +
        (opts.showSite ? '<td>' + escapeHtml(item.site) + '</td>' : '') +
        '<td>' + escapeHtml(row.category) + '</td>' +
        '<td>' + escapeHtml(row.subject) + (row.criterion ? '<br><span style="color:#8b96a8;font-size:.78rem;">' + escapeHtml(row.criterion) + '</span>' : '') + '</td>' +
        '<td>' + escapeHtml(row.appointee) + '</td>' +
        '<td>' + escapeHtml(row.appointedDate) + '</td>' +
        '<td>' + (row.termYears ? row.termYears + '년' : '') + (row.reportDeadline ? '<br><span style="color:#8b96a8;font-size:.78rem;">' + escapeHtml(row.reportDeadline) + '</span>' : '') + '</td>' +
        '<td>' + (dl.date ? fmtDate(dl.date) : '—') + '</td>' +
        '<td><span class="legal-badge is-' + dl.status + '">' + STATUS_TEXT[dl.status] + (dl.date ? ' ' + dl.label.replace(/^(만료|D-)/, '') : '') + '</span></td>' +
        '<td>' + escapeHtml(row.authority) + '</td>' +
        '<td class="legal-col-notes">' + escapeHtml(row.notes) + '</td>' +
        (opts.editable ?
          '<td class="no-print"><div class="legal-row-actions">' +
            '<button class="legal-btn legal-btn--outline legal-btn--sm legal-edit-row">수정</button>' +
            '<button class="legal-btn legal-btn--danger legal-btn--sm legal-delete-row">삭제</button>' +
          '</div></td>' : '') +
        '</tr>';
    }).join('');

    return '<div class="legal-table-wrap"><table class="legal-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function bindRowActions(panel, opts) {
    panel.querySelectorAll('.legal-edit-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var site = tr.getAttribute('data-site'), id = tr.getAttribute('data-id');
        var row = (state.sites[site] || []).find(function (r) { return r.id === id; });
        openRowModal(site, row);
      });
    });
    panel.querySelectorAll('.legal-delete-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var site = tr.getAttribute('data-site'), id = tr.getAttribute('data-id');
        if (!confirm('이 항목을 삭제할까요?')) return;
        state.sites[site] = (state.sites[site] || []).filter(function (r) { return r.id !== id; });
        saveState(); render();
      });
    });
  }

  /* ---- 항목 추가/수정 모달 ---- */

  function openRowModal(site, row) {
    var isEdit = !!row;
    var v = row || { category: '', subject: '', criterion: '', appointee: '', appointedDate: '', reportDeadline: '', termYears: '', nextEducationDate: '', authority: '', notes: '' };

    var overlay = document.createElement('div');
    overlay.className = 'legal-modal-overlay';
    overlay.innerHTML =
      '<div class="legal-modal">' +
        '<h3>' + (isEdit ? '항목 수정' : '항목 추가') + ' — ' + escapeHtml(site) + '</h3>' +
        '<div class="legal-form-grid">' +
          field('분야', 'category', v.category, 'text', CATEGORY_SUGGESTIONS) +
          field('선임자', 'appointee', v.appointee, 'text') +
          fieldFull('대상', 'subject', v.subject, 'text') +
          fieldFull('기준', 'criterion', v.criterion, 'text') +
          field('선임일', 'appointedDate', v.appointedDate, 'date') +
          field('선임신고기한', 'reportDeadline', v.reportDeadline, 'text') +
          field('선임기간(년)', 'termYears', v.termYears, 'number') +
          field('다음 교육/점검 기준일', 'nextEducationDate', v.nextEducationDate, 'date') +
          fieldFull('선임기관', 'authority', v.authority, 'text') +
          fieldFull('비고', 'notes', v.notes, 'textarea') +
        '</div>' +
        '<div class="legal-modal-actions">' +
          '<button class="legal-btn legal-btn--outline" id="legal-modal-cancel">취소</button>' +
          '<button class="legal-btn" id="legal-modal-save">저장</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function field(label, name, value, type, suggestions) {
      var listId = suggestions ? 'dl-' + name : '';
      return '<div class="legal-field"><label>' + label + '</label>' +
        '<input name="' + name + '" type="' + type + '" value="' + escapeHtml(value) + '"' + (listId ? ' list="' + listId + '"' : '') + '>' +
        (suggestions ? '<datalist id="' + listId + '">' + suggestions.map(function (s) { return '<option value="' + escapeHtml(s) + '">'; }).join('') + '</datalist>' : '') +
        '</div>';
    }
    function fieldFull(label, name, value, type) {
      if (type === 'textarea') {
        return '<div class="legal-field legal-field-full"><label>' + label + '</label><textarea name="' + name + '">' + escapeHtml(value) + '</textarea></div>';
      }
      return '<div class="legal-field legal-field-full"><label>' + label + '</label><input name="' + name + '" type="' + type + '" value="' + escapeHtml(value) + '"></div>';
    }

    overlay.querySelector('#legal-modal-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#legal-modal-save').addEventListener('click', function () {
      var form = overlay.querySelector('.legal-form-grid');
      var data = {};
      form.querySelectorAll('input,textarea').forEach(function (el) { data[el.name] = el.value.trim(); });
      if (!data.appointee && !data.subject) {
        if (!confirm('선임자와 대상이 모두 비어 있습니다. 그대로 저장할까요?')) return;
      }
      data.termYears = data.termYears ? Number(data.termYears) : '';

      if (isEdit) {
        Object.assign(row, data);
      } else {
        data.id = uid();
        state.sites[site] = state.sites[site] || [];
        state.sites[site].push(data);
      }
      saveState();
      overlay.remove();
      render();
    });
  }

  render();
})();
