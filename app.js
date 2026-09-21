(() => {
  'use strict';

  const STORAGE_KEY = 'little-days-data-v1';
  const TYPE_META = {
    water: { label: '喝水', mark: '水', group: 'water' },
    stool: { label: '大便', mark: '大', group: 'toilet' },
    urine: { label: '小便', mark: '小', group: 'toilet' },
    period_flow: { label: '经量', mark: '经', group: 'period' },
    period_pain: { label: '经期疼痛', mark: '经', group: 'period' },
    period_symptom: { label: '经期症状', mark: '经', group: 'period' },
    body_pain: { label: '普通疼痛', mark: '痛', group: 'pain' }
  };

  const pad = (value) => String(value).padStart(2, '0');
  const dateKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const datetimeLocal = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const startOfDay = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const diffDays = (left, right) => Math.round((startOfDay(left) - startOfDay(right)) / 86400000);
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  const state = {
    entries: [],
    settings: { waterGoal: 2000 },
    selectedDate: dateKey(),
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.entries)) state.entries = saved.entries.filter((item) => item && TYPE_META[item.type] && item.datetime);
      if (saved && saved.settings && Number(saved.settings.waterGoal) > 0) state.settings.waterGoal = Number(saved.settings.waterGoal);
    } catch (error) {
      showToast('本地数据读取失败，已使用空白状态');
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: state.entries, settings: state.settings }));
      return true;
    } catch (error) {
      showToast('保存失败，请先导出备份并检查存储空间');
      return false;
    }
  }

  const elements = {
    viewport: document.getElementById('appViewport'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    sheetKicker: document.getElementById('sheetKicker'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetContent: document.getElementById('sheetContent'),
    toast: document.getElementById('toast'),
    importFile: document.getElementById('importFile')
  };

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  function openSheet(kicker, title, content) {
    elements.sheetKicker.textContent = kicker;
    elements.sheetTitle.textContent = title;
    elements.sheetContent.innerHTML = content;
    elements.sheetBackdrop.classList.add('open');
    elements.sheetBackdrop.setAttribute('aria-hidden', 'false');
    const firstControl = elements.sheetContent.querySelector('input, button, select, textarea');
    if (firstControl) setTimeout(() => firstControl.focus({ preventScroll: true }), 220);
  }

  function closeSheet() {
    elements.sheetBackdrop.classList.remove('open');
    elements.sheetBackdrop.setAttribute('aria-hidden', 'true');
  }

  function choice(name, value, label, checked = false, type = 'radio') {
    return `<label class="choice-pill"><input type="${type}" name="${name}" value="${escapeHTML(value)}" ${checked ? 'checked' : ''}><span>${escapeHTML(label)}</span></label>`;
  }

  function commonFields() {
    return `
      <div class="field"><label for="recordTime">时间</label><input id="recordTime" name="datetime" type="datetime-local" value="${datetimeLocal()}" required></div>
      <div class="field"><label for="recordNote">备注（可不填）</label><textarea id="recordNote" name="note" maxlength="200" placeholder="想记下的细节"></textarea></div>
      <button class="form-submit" type="submit">保存记录</button>`;
  }

  function formFor(type) {
    if (type === 'water') {
      return `<form class="record-form" data-record-form="water">
        <div class="field"><span>常用容量</span><div class="choice-row" style="--columns:3">
          <button class="choice-pill" type="button" data-fill-amount="200"><span>200 ml</span></button>
          <button class="choice-pill" type="button" data-fill-amount="350"><span>350 ml</span></button>
          <button class="choice-pill" type="button" data-fill-amount="500"><span>500 ml</span></button>
        </div></div>
        <div class="field"><label for="waterAmount">饮水量（毫升）</label><input id="waterAmount" name="amount" type="number" min="1" max="5000" inputmode="numeric" value="250" required></div>
        ${commonFields()}</form>`;
    }
    if (type === 'stool') {
      return `<form class="record-form" data-record-form="stool">
        <div class="field"><span>形态</span><div class="choice-row" style="--columns:3">${choice('shape','偏硬','偏硬')}${choice('shape','适中','适中',true)}${choice('shape','偏软','偏软')}</div></div>
        <div class="field"><span>过程感受</span><div class="choice-row" style="--columns:3">${choice('comfort','顺畅','顺畅',true)}${choice('comfort','一般','一般')}${choice('comfort','困难','困难')}</div></div>
        ${commonFields()}</form>`;
    }
    if (type === 'urine') {
      return `<form class="record-form" data-record-form="urine">
        <div class="field"><span>颜色</span><div class="choice-row" style="--columns:3">${choice('color','清澈','清澈')}${choice('color','淡黄','淡黄',true)}${choice('color','深黄','深黄')}</div></div>
        <div class="field"><span>感受</span><div class="choice-row" style="--columns:2">${choice('urgency','正常','正常',true)}${choice('urgency','急迫','比较急')}</div></div>
        ${commonFields()}</form>`;
    }
    if (type === 'period_flow') {
      return `<form class="record-form" data-record-form="period_flow">
        <div class="field"><span>经量</span><div class="choice-row" style="--columns:3">${choice('flow','少量','少量')}${choice('flow','中等','中等',true)}${choice('flow','大量','大量')}</div></div>
        ${commonFields()}</form>`;
    }
    if (type === 'period_pain' || type === 'body_pain') {
      const isPeriod = type === 'period_pain';
      return `<form class="record-form" data-record-form="${type}">
        <p class="form-help">${isPeriod ? '这条记录只归入生理期疼痛。' : '这条记录与生理期疼痛分开统计。'}</p>
        <div class="field"><label for="painLocation">疼痛部位</label><input id="painLocation" name="location" type="text" maxlength="30" placeholder="例如：小腹、腰部、头部" required></div>
        <div class="field"><span>疼痛程度（0–10）</span><div class="range-wrap"><input name="level" type="range" min="0" max="10" value="3" data-range><output class="range-value">3</output></div></div>
        <div class="field"><label for="painDuration">持续时间</label><select id="painDuration" name="duration"><option>少于 15 分钟</option><option>15–60 分钟</option><option>1–3 小时</option><option>超过 3 小时</option><option>持续中</option></select></div>
        ${commonFields()}</form>`;
    }
    if (type === 'period_symptom') {
      return `<form class="record-form" data-record-form="period_symptom">
        <div class="field"><span>可以多选</span><div class="choice-row" style="--columns:3">
          ${choice('symptoms','腹胀','腹胀',false,'checkbox')}${choice('symptoms','乏力','乏力',false,'checkbox')}${choice('symptoms','情绪波动','情绪波动',false,'checkbox')}
          ${choice('symptoms','乳房胀痛','乳房胀痛',false,'checkbox')}${choice('symptoms','头痛','头痛',false,'checkbox')}${choice('symptoms','其他','其他',false,'checkbox')}
        </div></div>
        ${commonFields()}</form>`;
    }
    return '';
  }

  function openRecord(type) {
    if (type === 'period') {
      openSheet('生理期记录', '这次想记什么？', `<div class="record-groups">
        <article class="record-group menstrual-group"><div class="three-actions">
          <button data-period-choice="period_flow">经量</button>
          <button data-period-choice="period_pain">经期疼痛</button>
          <button data-period-choice="period_symptom">其他症状</button>
        </div></article>
        <p class="form-help">经期疼痛会保存在生理期分类内，不会混入普通疼痛。</p>
      </div>`);
      return;
    }
    const titles = {
      water: '记录喝水', stool: '记录大便', urine: '记录小便', period_flow: '记录经量',
      period_pain: '记录经期疼痛', period_symptom: '记录经期症状', body_pain: '记录普通疼痛'
    };
    openSheet('新增记录', titles[type], formFor(type));
    bindDynamicForm();
  }

  function bindDynamicForm() {
    elements.sheetContent.querySelectorAll('[data-fill-amount]').forEach((button) => {
      button.addEventListener('click', () => {
        const amount = document.getElementById('waterAmount');
        if (amount) amount.value = button.dataset.fillAmount;
      });
    });
    elements.sheetContent.querySelectorAll('[data-range]').forEach((range) => {
      range.addEventListener('input', () => { range.nextElementSibling.textContent = range.value; });
    });
    const form = elements.sheetContent.querySelector('[data-record-form]');
    if (form) form.addEventListener('submit', handleRecordSubmit);
  }

  function handleRecordSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.dataset.recordForm;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    if (type === 'period_symptom') payload.symptoms = formData.getAll('symptoms');
    if (type === 'water') {
      payload.amount = Number(payload.amount);
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        showToast('请输入有效的饮水量');
        return;
      }
    }
    if (type === 'period_pain' || type === 'body_pain') payload.level = Number(payload.level);
    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      datetime: new Date(payload.datetime).toISOString(),
      payload,
      createdAt: new Date().toISOString()
    };
    if (Number.isNaN(new Date(entry.datetime).getTime())) {
      showToast('请选择有效时间');
      return;
    }
    state.entries.push(entry);
    state.entries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    if (saveState()) {
      closeSheet();
      renderAll();
      showToast('已保存到这台设备');
    }
  }

  function describeEntry(entry) {
    const data = entry.payload || {};
    if (entry.type === 'water') return `${Number(data.amount) || 0} ml`;
    if (entry.type === 'stool') return [data.shape, data.comfort].filter(Boolean).join(' · ');
    if (entry.type === 'urine') return [data.color, data.urgency].filter(Boolean).join(' · ');
    if (entry.type === 'period_flow') return data.flow || '未填写经量';
    if (entry.type === 'period_pain' || entry.type === 'body_pain') return `${data.location || '未填部位'} · ${Number(data.level) || 0} 级 · ${data.duration || ''}`;
    if (entry.type === 'period_symptom') return Array.isArray(data.symptoms) && data.symptoms.length ? data.symptoms.join('、') : '未选择症状';
    return '';
  }

  function emptyState(message = '还没有记录', helper = '第一条记录会安静地出现在这里。') {
    return `<div class="empty-state"><div class="empty-shape" aria-hidden="true"></div><strong>${escapeHTML(message)}</strong><p>${escapeHTML(helper)}</p></div>`;
  }

  function renderTimeline(container, entries) {
    if (!entries.length) {
      container.innerHTML = emptyState();
      return;
    }
    container.innerHTML = entries.map((entry) => {
      const meta = TYPE_META[entry.type];
      const date = new Date(entry.datetime);
      const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      const note = entry.payload?.note ? ` · ${entry.payload.note}` : '';
      return `<article class="timeline-item">
        <span class="timeline-mark ${meta.group}">${meta.mark}</span>
        <div class="timeline-copy"><strong>${escapeHTML(meta.label)} · ${time}</strong><small>${escapeHTML(describeEntry(entry) + note)}</small></div>
        <button class="delete-record" data-delete="${escapeHTML(entry.id)}" aria-label="删除这条记录">×</button>
      </article>`;
    }).join('');
  }

  function entriesForDay(dayKey) {
    return state.entries.filter((entry) => dateKey(entry.datetime) === dayKey).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  }

  function renderToday() {
    const todayEntries = entriesForDay(dateKey());
    const water = todayEntries.filter((entry) => entry.type === 'water').reduce((sum, entry) => sum + (Number(entry.payload?.amount) || 0), 0);
    const percent = Math.min(100, Math.max(0, (water / state.settings.waterGoal) * 100));
    document.getElementById('todayWater').textContent = water;
    document.getElementById('waterGoalLabel').textContent = `/ ${state.settings.waterGoal} ml`;
    document.getElementById('waterProgress').style.width = `${percent}%`;
    document.getElementById('todayCount').textContent = `${todayEntries.length} 条`;
    renderTimeline(document.getElementById('todayTimeline'), todayEntries);

    const flowToday = todayEntries.filter((entry) => entry.type === 'period_flow');
    const periodStatus = document.getElementById('periodStatus');
    if (flowToday.length) periodStatus.textContent = `今天 · ${flowToday[0].payload?.flow || '已记录'}`;
    else {
      const latestFlow = state.entries.find((entry) => entry.type === 'period_flow');
      periodStatus.textContent = latestFlow ? `最近 ${new Date(latestFlow.datetime).getMonth() + 1}/${new Date(latestFlow.datetime).getDate()}` : '尚未记录';
    }

    const painToday = todayEntries.filter((entry) => entry.type === 'period_pain' || entry.type === 'body_pain');
    document.getElementById('painStatus').textContent = painToday.length ? `${painToday.length} 条 · 最高 ${Math.max(...painToday.map((entry) => Number(entry.payload?.level) || 0))} 级` : '无记录';
  }

  function renderCalendar() {
    const cursor = state.calendarCursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    document.getElementById('calendarMonth').textContent = `${year} 年 ${month + 1} 月`;
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - mondayOffset);
    const recordedDays = new Set(state.entries.map((entry) => dateKey(entry.datetime)));
    const today = dateKey();
    let html = '';
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const key = dateKey(day);
      const classes = ['calendar-day'];
      if (day.getMonth() !== month) classes.push('outside');
      if (recordedDays.has(key)) classes.push('has-data');
      if (key === today) classes.push('today');
      if (key === state.selectedDate) classes.push('selected');
      html += `<button class="${classes.join(' ')}" data-calendar-date="${key}" aria-label="${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日">${day.getDate()}</button>`;
    }
    document.getElementById('calendarGrid').innerHTML = html;
    const selected = new Date(`${state.selectedDate}T12:00:00`);
    document.getElementById('selectedDateTitle').textContent = `${selected.getMonth() + 1} 月 ${selected.getDate()} 日`;
    const selectedEntries = entriesForDay(state.selectedDate);
    document.getElementById('selectedDateCount').textContent = `${selectedEntries.length} 条`;
    renderTimeline(document.getElementById('selectedTimeline'), selectedEntries);
  }

  function periodStarts() {
    const uniqueDays = [...new Set(state.entries.filter((entry) => entry.type === 'period_flow').map((entry) => dateKey(entry.datetime)))].sort();
    const starts = [];
    uniqueDays.forEach((day, index) => {
      if (index === 0 || diffDays(day, uniqueDays[index - 1]) > 2) starts.push(day);
    });
    return starts;
  }

  function renderTrends() {
    const days = [];
    const today = startOfDay(new Date());
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      const key = dateKey(day);
      const amount = entriesForDay(key).filter((entry) => entry.type === 'water').reduce((sum, entry) => sum + (Number(entry.payload?.amount) || 0), 0);
      days.push({ date: day, amount });
    }
    const max = Math.max(state.settings.waterGoal, ...days.map((item) => item.amount), 1);
    document.getElementById('waterChart').innerHTML = days.map((item) => {
      const height = item.amount ? Math.max(4, Math.round((item.amount / max) * 100)) : 2;
      return `<div class="bar-column" title="${item.amount} ml"><div class="bar-wrap"><span class="bar" style="height:${height}%"></span></div><label>${item.date.getMonth() + 1}/${item.date.getDate()}</label></div>`;
    }).join('');
    const total = days.reduce((sum, item) => sum + item.amount, 0);
    document.getElementById('waterAverage').textContent = total ? `日均 ${Math.round(total / 7)} ml` : '暂无数据';

    const starts = periodStarts();
    if (starts.length >= 2) {
      const intervals = starts.slice(1).map((day, index) => diffDays(day, starts[index]));
      const average = Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
      document.getElementById('cycleMetric').textContent = `平均 ${average} 天`;
      document.getElementById('cycleDetail').textContent = `依据 ${starts.length} 个周期起点计算，仅供个人观察。`;
    } else if (starts.length === 1) {
      document.getElementById('cycleMetric').textContent = '已记录 1 次';
      document.getElementById('cycleDetail').textContent = '再记录一个周期后显示间隔。';
    } else {
      document.getElementById('cycleMetric').textContent = '需要更多记录';
      document.getElementById('cycleDetail').textContent = '至少记录两个周期后显示。';
    }

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 29);
    threshold.setHours(0, 0, 0, 0);
    const pains = state.entries.filter((entry) => (entry.type === 'period_pain' || entry.type === 'body_pain') && new Date(entry.datetime) >= threshold);
    if (pains.length) {
      const periodCount = pains.filter((entry) => entry.type === 'period_pain').length;
      const bodyCount = pains.length - periodCount;
      const averageLevel = (pains.reduce((sum, entry) => sum + (Number(entry.payload?.level) || 0), 0) / pains.length).toFixed(1);
      document.getElementById('painMetric').textContent = `${pains.length} 次 · 均 ${averageLevel} 级`;
      document.getElementById('painDetail').textContent = `经期 ${periodCount} 次，普通 ${bodyCount} 次。`;
    } else {
      document.getElementById('painMetric').textContent = '暂无记录';
      document.getElementById('painDetail').textContent = '经期疼痛与普通疼痛分开统计。';
    }
  }

  function renderDateLabels() {
    const now = new Date();
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    document.getElementById('todayLabel').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;
  }

  function renderAll() {
    renderDateLabels();
    renderToday();
    renderCalendar();
    renderTrends();
  }

  function navigate(page) {
    document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
    document.querySelectorAll('[data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === page));
    elements.viewport.scrollTop = 0;
    if (page === 'calendar') renderCalendar();
    if (page === 'trends') renderTrends();
  }

  function settingsContent() {
    return `<div class="settings-list">
      <article class="setting-card"><h3>每日饮水目标</h3><p>用于首页进度和趋势图参考。</p><div class="goal-row"><input id="goalInput" type="number" min="200" max="10000" step="100" value="${state.settings.waterGoal}" inputmode="numeric"><button id="saveGoal">保存</button></div></article>
      <article class="setting-card"><h3>数据备份</h3><p>导出为 JSON 文件；换设备或清理浏览器前建议先备份。</p><button id="exportData">导出数据</button><button id="importData">导入备份</button></article>
      <article class="setting-card"><h3>添加到 iPhone 主屏幕</h3><p>使用 Safari 打开已发布的页面，点击“分享”，再选择“添加到主屏幕”。离线能力需要通过 HTTPS 地址打开。</p></article>
      <article class="setting-card"><h3>隐私</h3><p>记录默认只保存在当前浏览器，不会自动上传。本工具不提供医疗诊断；异常或持续疼痛请及时就医。</p></article>
      <article class="setting-card"><h3>清除记录</h3><p>此操作会删除当前设备上的全部健康记录。</p><button class="danger" id="clearData">清除全部数据</button></article>
    </div>`;
  }

  function openSettings() {
    openSheet('本机设置', '设置与数据', settingsContent());
    document.getElementById('saveGoal').addEventListener('click', () => {
      const value = Number(document.getElementById('goalInput').value);
      if (!Number.isFinite(value) || value < 200 || value > 10000) {
        showToast('饮水目标需在 200–10000 ml 之间');
        return;
      }
      state.settings.waterGoal = value;
      saveState();
      renderAll();
      showToast('饮水目标已保存');
    });
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => elements.importFile.click());
    document.getElementById('clearData').addEventListener('click', clearData);
  }

  function exportData() {
    const backup = {
      app: '小日子', version: 1, exportedAt: new Date().toISOString(),
      entries: state.entries, settings: state.settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `小日子备份-${dateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('备份文件已生成');
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!backup || !Array.isArray(backup.entries)) throw new Error('invalid');
        const validEntries = backup.entries.filter((item) => item && TYPE_META[item.type] && item.id && item.datetime && !Number.isNaN(new Date(item.datetime).getTime()));
        if (!window.confirm(`将导入 ${validEntries.length} 条记录并替换当前数据，继续吗？`)) return;
        state.entries = validEntries;
        if (backup.settings && Number(backup.settings.waterGoal) > 0) state.settings.waterGoal = Number(backup.settings.waterGoal);
        saveState();
        renderAll();
        closeSheet();
        showToast(`已导入 ${validEntries.length} 条记录`);
      } catch (error) {
        showToast('无法识别这个备份文件');
      } finally {
        elements.importFile.value = '';
      }
    });
    reader.readAsText(file);
  }

  function clearData() {
    if (!window.confirm('确定删除当前设备上的全部记录吗？此操作无法撤销。')) return;
    state.entries = [];
    saveState();
    renderAll();
    closeSheet();
    showToast('全部记录已清除');
  }

  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
  document.querySelectorAll('[data-open-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.openRecord)));
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('closeSheet').addEventListener('click', closeSheet);
  elements.sheetBackdrop.addEventListener('click', (event) => { if (event.target === elements.sheetBackdrop) closeSheet(); });
  elements.importFile.addEventListener('change', () => importData(elements.importFile.files[0]));
  document.getElementById('prevMonth').addEventListener('click', () => { state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1); renderCalendar(); });
  document.getElementById('nextMonth').addEventListener('click', () => { state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1); renderCalendar(); });

  document.addEventListener('click', (event) => {
    const periodChoice = event.target.closest('[data-period-choice]');
    if (periodChoice) openRecord(periodChoice.dataset.periodChoice);

    const dayButton = event.target.closest('[data-calendar-date]');
    if (dayButton) {
      state.selectedDate = dayButton.dataset.calendarDate;
      const selected = new Date(`${state.selectedDate}T12:00:00`);
      state.calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
      renderCalendar();
    }

    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      if (!window.confirm('删除这条记录吗？')) return;
      state.entries = state.entries.filter((entry) => entry.id !== deleteButton.dataset.delete);
      saveState();
      renderAll();
      showToast('记录已删除');
    }
  });

  function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  loadState();
  updateClock();
  setInterval(updateClock, 30000);
  renderAll();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
