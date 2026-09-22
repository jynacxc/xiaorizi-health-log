(() => {
  'use strict';

  const STORAGE_KEY = 'little-days-data-v1';
  const TYPE_META = {
    water: { label: '喝水', mark: '水', group: 'water' },
    stool: { label: '大便', mark: '大', group: 'toilet' },
    urine: { label: '小便', mark: '小', group: 'toilet' },
    period_day: { label: '经期日记', mark: '经', group: 'period' },
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
  const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dayISO = (day) => new Date(`${day}T12:00:00`).toISOString();
  const validDayKey = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && !Number.isNaN(new Date(`${day}T12:00:00`).getTime());

  const state = {
    entries: [],
    periods: [],
    settings: { waterGoal: 2000 },
    selectedDate: dateKey(),
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  };

  function normalizePeriods(periods) {
    return (Array.isArray(periods) ? periods : []).filter((period) => period && validDayKey(period.startDate) && (!period.endDate || validDayKey(period.endDate))).map((period) => ({
      id: String(period.id || createId()),
      startDate: period.startDate,
      endDate: period.endDate || null,
      createdAt: period.createdAt || new Date().toISOString(),
      updatedAt: period.updatedAt || period.createdAt || new Date().toISOString()
    })).filter((period) => !period.endDate || period.endDate >= period.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  function inferPeriodsFromEntries(entries = state.entries) {
    const days = [...new Set(entries.filter((entry) => entry.type === 'period_day' || entry.type === 'period_flow').map((entry) => dateKey(entry.datetime)))].sort();
    const groups = [];
    days.forEach((day) => {
      const current = groups[groups.length - 1];
      if (!current || diffDays(day, current[current.length - 1]) > 2) groups.push([day]);
      else current.push(day);
    });
    return groups.map((group) => ({
      id: `legacy-${group[0]}`,
      startDate: group[0],
      endDate: group[group.length - 1],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })).reverse();
  }

  function activePeriod() {
    return state.periods.find((period) => !period.endDate) || null;
  }

  function periodEndKey(period) {
    return period.endDate || dateKey();
  }

  function periodLength(period) {
    return Math.max(1, diffDays(periodEndKey(period), period.startDate) + 1);
  }

  function periodForDay(day) {
    return state.periods.find((period) => day >= period.startDate && day <= periodEndKey(period)) || null;
  }

  function periodById(id) {
    return state.periods.find((period) => period.id === id) || null;
  }

  function periodDayNumber(period, day) {
    return Math.max(1, diffDays(day, period.startDate) + 1);
  }

  function periodsOverlap(startDate, endDate, ignoredId = '') {
    return state.periods.some((period) => period.id !== ignoredId && startDate <= periodEndKey(period) && endDate >= period.startDate);
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.entries)) state.entries = saved.entries.filter((item) => item && TYPE_META[item.type] && item.datetime);
      if (saved && Array.isArray(saved.periods)) state.periods = normalizePeriods(saved.periods);
      else state.periods = inferPeriodsFromEntries();
      if (saved && saved.settings && Number(saved.settings.waterGoal) > 0) state.settings.waterGoal = Number(saved.settings.waterGoal);
    } catch (error) {
      showToast('本地数据读取失败，已使用空白状态');
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: state.entries, periods: state.periods, settings: state.settings }));
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

  function periodSymptomChoices(selected = []) {
    const has = (value) => selected.includes(value);
    return `${choice('symptoms','腹胀','腹胀',has('腹胀'),'checkbox')}${choice('symptoms','乏力','乏力',has('乏力'),'checkbox')}${choice('symptoms','情绪波动','情绪波动',has('情绪波动'),'checkbox')}
      ${choice('symptoms','乳房胀痛','乳房胀痛',has('乳房胀痛'),'checkbox')}${choice('symptoms','头痛','头痛',has('头痛'),'checkbox')}${choice('symptoms','其他','其他',has('其他'),'checkbox')}`;
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
    if (type === 'period_start') {
      return `<form class="record-form" data-record-form="period_start">
        <p class="form-help">开始后会进入“持续中”，直到你主动结束这次经期。</p>
        <div class="field"><label for="periodStartDate">开始日期</label><input id="periodStartDate" name="startDate" type="date" max="${dateKey()}" value="${dateKey()}" required></div>
        <div class="field"><span>第一天经量</span><div class="choice-row" style="--columns:4">${choice('flow','点滴','点滴')}${choice('flow','少量','少量')}${choice('flow','中等','中等',true)}${choice('flow','大量','大量')}</div></div>
        <div class="field"><span>经期疼痛（0–10）</span><div class="range-wrap"><input name="painLevel" type="range" min="0" max="10" value="0" data-range><output class="range-value">0</output></div></div>
        <div class="field"><span>其他症状（可多选）</span><div class="choice-row" style="--columns:3">${periodSymptomChoices()}</div></div>
        <div class="field"><label for="periodStartNote">备注（可不填）</label><textarea id="periodStartNote" name="note" maxlength="200" placeholder="今天的感受"></textarea></div>
        <button class="form-submit" type="submit">保存并开始</button>
      </form>`;
    }
    if (type === 'period_day') {
      const current = activePeriod();
      const existing = state.entries.find((entry) => entry.type === 'period_day' && entry.payload?.periodId === current?.id && dateKey(entry.datetime) === dateKey());
      const daily = existing?.payload || {};
      const flow = daily.flow || '中等';
      const painLevel = Number(daily.painLevel) || 0;
      return `<form class="record-form" data-record-form="period_day">
        <p class="form-help">每天保存一份小结；重复填写同一天会更新原记录。</p>
        <div class="field"><label for="periodLogDate">记录日期</label><input id="periodLogDate" name="logDate" type="date" min="${current?.startDate || dateKey()}" max="${dateKey()}" value="${dateKey()}" required></div>
        <div class="field"><span>今天的经量</span><div class="choice-row" style="--columns:4">${choice('flow','点滴','点滴',flow === '点滴')}${choice('flow','少量','少量',flow === '少量')}${choice('flow','中等','中等',flow === '中等')}${choice('flow','大量','大量',flow === '大量')}</div></div>
        <div class="field"><span>经期疼痛（0–10）</span><div class="range-wrap"><input name="painLevel" type="range" min="0" max="10" value="${painLevel}" data-range><output class="range-value">${painLevel}</output></div></div>
        <div class="field"><span>其他症状（可多选）</span><div class="choice-row" style="--columns:3">${periodSymptomChoices(Array.isArray(daily.symptoms) ? daily.symptoms : [])}</div></div>
        <div class="field"><label for="periodDayNote">备注（可不填）</label><textarea id="periodDayNote" name="note" maxlength="200" placeholder="今天的变化">${escapeHTML(daily.note || '')}</textarea></div>
        <button class="form-submit" type="submit">保存今天</button>
      </form>`;
    }
    if (type === 'period_end') {
      const current = activePeriod();
      return `<form class="record-form" data-record-form="period_end">
        <p class="form-help">结束后，这次经期会作为一段完整日期保留在日历中。</p>
        <div class="field"><label for="periodEndDate">结束日期</label><input id="periodEndDate" name="endDate" type="date" min="${current?.startDate || dateKey()}" max="${dateKey()}" value="${dateKey()}" required></div>
        <button class="form-submit" type="submit">确认结束</button>
      </form>`;
    }
    if (type === 'period_backfill') {
      return `<form class="record-form" data-record-form="period_backfill">
        <p class="form-help">适合补记以前已经结束的一次经期。</p>
        <div class="period-date-grid">
          <div class="field"><label for="backfillStart">开始日期</label><input id="backfillStart" name="startDate" type="date" max="${dateKey()}" required></div>
          <div class="field"><label for="backfillEnd">结束日期</label><input id="backfillEnd" name="endDate" type="date" max="${dateKey()}" required></div>
        </div>
        <button class="form-submit" type="submit">保存这段经期</button>
      </form>`;
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
          ${periodSymptomChoices()}
        </div></div>
        ${commonFields()}</form>`;
    }
    return '';
  }

  function shortDay(day) {
    const date = new Date(`${day}T12:00:00`);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function periodHistoryMarkup() {
    const recent = state.periods.filter((period) => period.endDate).slice(0, 3);
    if (!recent.length) return '';
    return `<div class="period-history"><span>最近记录</span>${recent.map((period) => `<div><strong>${escapeHTML(shortDay(period.startDate))}–${escapeHTML(shortDay(period.endDate))}</strong><small>${periodLength(period)} 天</small></div>`).join('')}</div>`;
  }

  function openRecord(type) {
    if (type === 'period') {
      const current = activePeriod();
      const progress = current ? `<article class="period-progress">
          <span class="period-progress-mark">第 ${periodLength(current)} 天</span>
          <div><small>${escapeHTML(shortDay(current.startDate))} 开始</small><strong>这次经期正在持续</strong><p>每天可以补充经量、疼痛和身体感受。</p></div>
        </article>
        <div class="period-actions">
          <button class="form-submit" data-period-choice="period_day">记录今天</button>
          <button class="soft-action" data-period-action="end">结束这次经期</button>
        </div>` : `<article class="period-progress resting">
          <span class="period-progress-mark">待开始</span>
          <div><small>把经期当作一段过程</small><strong>目前没有进行中的经期</strong><p>开始后，App 会连续计算天数并在日历中标记。</p></div>
        </article>
        <div class="period-actions">
          <button class="form-submit" data-period-action="start">开始一次经期</button>
          <button class="soft-action" data-period-action="backfill">补记过去的经期</button>
        </div>`;
      openSheet('生理期过程', current ? '正在持续中' : '开始与结束', `<div class="period-hub">${progress}${periodHistoryMarkup()}<p class="form-help">经期疼痛仍与普通疼痛分开统计；记录只保存在当前设备。</p></div>`);
      return;
    }
    const titles = {
      water: '记录喝水', stool: '记录大便', urine: '记录小便', period_flow: '记录经量',
      period_start: '开始一次经期', period_day: '今天的经期小结', period_end: '结束这次经期', period_backfill: '补记一段经期',
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
    const periodLogDate = elements.sheetContent.querySelector('#periodLogDate');
    if (form && periodLogDate) {
      periodLogDate.addEventListener('change', () => {
        const current = activePeriod();
        const existing = state.entries.find((entry) => entry.type === 'period_day' && entry.payload?.periodId === current?.id && dateKey(entry.datetime) === periodLogDate.value);
        const data = existing?.payload || {};
        const flow = data.flow || '中等';
        form.querySelectorAll('[name="flow"]').forEach((input) => { input.checked = input.value === flow; });
        const painRange = form.querySelector('[name="painLevel"]');
        if (painRange) {
          painRange.value = Number(data.painLevel) || 0;
          painRange.nextElementSibling.textContent = painRange.value;
        }
        const symptoms = Array.isArray(data.symptoms) ? data.symptoms : [];
        form.querySelectorAll('[name="symptoms"]').forEach((input) => { input.checked = symptoms.includes(input.value); });
        const note = form.querySelector('[name="note"]');
        if (note) note.value = data.note || '';
      });
    }
    if (form) form.addEventListener('submit', handleRecordSubmit);
  }

  function periodDayPayload(formData, periodId) {
    return {
      periodId,
      flow: formData.get('flow') || '中等',
      painLevel: Number(formData.get('painLevel')) || 0,
      symptoms: formData.getAll('symptoms'),
      note: formData.get('note') || ''
    };
  }

  function upsertPeriodDay(period, day, formData) {
    const existing = state.entries.find((entry) => entry.type === 'period_day' && entry.payload?.periodId === period.id && dateKey(entry.datetime) === day);
    if (existing) {
      existing.datetime = dayISO(day);
      existing.payload = periodDayPayload(formData, period.id);
      existing.updatedAt = new Date().toISOString();
      return false;
    }
    state.entries.push({
      id: createId(),
      type: 'period_day',
      datetime: dayISO(day),
      payload: periodDayPayload(formData, period.id),
      createdAt: new Date().toISOString()
    });
    return true;
  }

  function finishPeriodChange(message) {
    state.periods.sort((a, b) => b.startDate.localeCompare(a.startDate));
    state.entries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    if (saveState()) {
      closeSheet();
      renderAll();
      showToast(message);
    }
  }

  function handleRecordSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.dataset.recordForm;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    if (type === 'period_start') {
      const startDate = formData.get('startDate');
      if (!validDayKey(startDate) || startDate > dateKey()) return showToast('请选择有效的开始日期');
      if (activePeriod()) return showToast('已有一段经期正在持续');
      if (periodsOverlap(startDate, dateKey())) return showToast('这段日期与已有经期重叠');
      const period = { id: createId(), startDate, endDate: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.periods.push(period);
      upsertPeriodDay(period, startDate, formData);
      finishPeriodChange('这次经期已开始');
      return;
    }
    if (type === 'period_day') {
      const period = activePeriod();
      const logDate = formData.get('logDate');
      if (!period) return showToast('请先开始一次经期');
      if (!validDayKey(logDate) || logDate < period.startDate || logDate > dateKey()) return showToast('日期需在本次经期范围内');
      const created = upsertPeriodDay(period, logDate, formData);
      period.updatedAt = new Date().toISOString();
      finishPeriodChange(created ? '今天的经期记录已保存' : '今天的经期记录已更新');
      return;
    }
    if (type === 'period_end') {
      const period = activePeriod();
      const endDate = formData.get('endDate');
      if (!period) return showToast('没有进行中的经期');
      const latestLog = state.entries.filter((entry) => entry.type === 'period_day' && entry.payload?.periodId === period.id).map((entry) => dateKey(entry.datetime)).sort().pop();
      if (!validDayKey(endDate) || endDate < period.startDate || endDate > dateKey()) return showToast('请选择有效的结束日期');
      if (latestLog && endDate < latestLog) return showToast(`结束日期不能早于 ${shortDay(latestLog)} 的记录`);
      period.endDate = endDate;
      period.updatedAt = new Date().toISOString();
      finishPeriodChange(`这次经期共 ${periodLength(period)} 天`);
      return;
    }
    if (type === 'period_backfill') {
      const startDate = formData.get('startDate');
      const endDate = formData.get('endDate');
      if (!validDayKey(startDate) || !validDayKey(endDate) || startDate > endDate || endDate > dateKey()) return showToast('请检查开始和结束日期');
      if (periodsOverlap(startDate, endDate)) return showToast('这段日期与已有经期重叠');
      state.periods.push({ id: createId(), startDate, endDate, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      finishPeriodChange(`已补记 ${diffDays(endDate, startDate) + 1} 天`);
      return;
    }
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
      id: createId(),
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
    if (entry.type === 'period_day') {
      const pain = Number(data.painLevel) || 0;
      const symptoms = Array.isArray(data.symptoms) && data.symptoms.length ? ` · ${data.symptoms.join('、')}` : '';
      return `${data.flow || '未填经量'} · ${pain ? `经痛 ${pain} 级` : '无经痛'}${symptoms}`;
    }
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
      const linkedPeriod = entry.type === 'period_day' ? (periodById(entry.payload?.periodId) || periodForDay(dateKey(entry.datetime))) : null;
      const timeLabel = linkedPeriod ? `第 ${periodDayNumber(linkedPeriod, dateKey(entry.datetime))} 天` : time;
      const note = entry.payload?.note ? ` · ${entry.payload.note}` : '';
      return `<article class="timeline-item">
        <span class="timeline-mark ${meta.group}">${meta.mark}</span>
        <div class="timeline-copy"><strong>${escapeHTML(meta.label)} · ${escapeHTML(timeLabel)}</strong><small>${escapeHTML(describeEntry(entry) + note)}</small></div>
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

    const periodStatus = document.getElementById('periodStatus');
    const current = activePeriod();
    const latestPeriod = state.periods[0];
    if (current) periodStatus.textContent = `第 ${periodLength(current)} 天 · 持续中`;
    else if (latestPeriod) periodStatus.textContent = `上次 ${periodLength(latestPeriod)} 天`;
    else periodStatus.textContent = '尚未记录';

    const groupStatus = document.getElementById('periodGroupStatus');
    if (groupStatus) {
      if (current) groupStatus.textContent = `第 ${periodLength(current)} 天，${shortDay(current.startDate)} 开始`;
      else if (latestPeriod) groupStatus.textContent = `上次 ${shortDay(latestPeriod.startDate)}–${shortDay(latestPeriod.endDate)}，共 ${periodLength(latestPeriod)} 天`;
      else groupStatus.textContent = '记录开始、每日变化和结束';
    }

    const painLevels = todayEntries.map((entry) => {
      if (entry.type === 'period_day') return Number(entry.payload?.painLevel) || 0;
      if (entry.type === 'period_pain' || entry.type === 'body_pain') return Number(entry.payload?.level) || 0;
      return 0;
    }).filter((level) => level > 0);
    document.getElementById('painStatus').textContent = painLevels.length ? `${painLevels.length} 条 · 最高 ${Math.max(...painLevels)} 级` : '无记录';
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
    const periodStartsSet = new Set(state.periods.map((period) => period.startDate));
    const periodEndsSet = new Set(state.periods.map((period) => periodEndKey(period)));
    const today = dateKey();
    let html = '';
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const key = dateKey(day);
      const classes = ['calendar-day'];
      if (day.getMonth() !== month) classes.push('outside');
      if (recordedDays.has(key)) classes.push('has-data');
      if (periodForDay(key)) classes.push('in-period');
      if (periodStartsSet.has(key)) classes.push('period-start');
      if (periodEndsSet.has(key)) classes.push('period-end');
      if (key === today) classes.push('today');
      if (key === state.selectedDate) classes.push('selected');
      html += `<button class="${classes.join(' ')}" data-calendar-date="${key}" aria-label="${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日">${day.getDate()}</button>`;
    }
    document.getElementById('calendarGrid').innerHTML = html;
    const selected = new Date(`${state.selectedDate}T12:00:00`);
    document.getElementById('selectedDateTitle').textContent = `${selected.getMonth() + 1} 月 ${selected.getDate()} 日`;
    const selectedEntries = entriesForDay(state.selectedDate);
    const selectedPeriod = periodForDay(state.selectedDate);
    document.getElementById('selectedDateCount').textContent = selectedPeriod ? `经期第 ${periodDayNumber(selectedPeriod, state.selectedDate)} 天 · ${selectedEntries.length} 条` : `${selectedEntries.length} 条`;
    const selectedTimeline = document.getElementById('selectedTimeline');
    if (!selectedEntries.length && selectedPeriod) selectedTimeline.innerHTML = emptyState(`经期第 ${periodDayNumber(selectedPeriod, state.selectedDate)} 天`, '这一天还没有填写经量、疼痛或其他感受。');
    else renderTimeline(selectedTimeline, selectedEntries);
  }

  function periodStarts() {
    return state.periods.map((period) => period.startDate).sort();
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
    const completedPeriods = state.periods.filter((period) => period.endDate);
    const averageDuration = completedPeriods.length ? Math.round(completedPeriods.reduce((sum, period) => sum + periodLength(period), 0) / completedPeriods.length) : 0;
    if (starts.length >= 2) {
      const intervals = starts.slice(1).map((day, index) => diffDays(day, starts[index]));
      const average = Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
      document.getElementById('cycleMetric').textContent = `平均 ${average} 天`;
      document.getElementById('cycleDetail').textContent = `${averageDuration ? `平均经期 ${averageDuration} 天 · ` : ''}依据 ${starts.length} 个周期起点计算。`;
    } else if (starts.length === 1) {
      const onlyPeriod = state.periods[0];
      document.getElementById('cycleMetric').textContent = onlyPeriod.endDate ? `持续 ${periodLength(onlyPeriod)} 天` : `本次第 ${periodLength(onlyPeriod)} 天`;
      document.getElementById('cycleDetail').textContent = '再记录一个周期后显示周期间隔。';
    } else {
      document.getElementById('cycleMetric').textContent = '需要更多记录';
      document.getElementById('cycleDetail').textContent = '至少记录两个周期后显示。';
    }

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 29);
    threshold.setHours(0, 0, 0, 0);
    const pains = state.entries.filter((entry) => {
      const isLegacyPain = entry.type === 'period_pain' || entry.type === 'body_pain';
      const isDailyPeriodPain = entry.type === 'period_day' && (Number(entry.payload?.painLevel) || 0) > 0;
      return (isLegacyPain || isDailyPeriodPain) && new Date(entry.datetime) >= threshold;
    });
    if (pains.length) {
      const levelFor = (entry) => entry.type === 'period_day' ? (Number(entry.payload?.painLevel) || 0) : (Number(entry.payload?.level) || 0);
      const periodCount = pains.filter((entry) => entry.type === 'period_pain' || entry.type === 'period_day').length;
      const bodyCount = pains.length - periodCount;
      const averageLevel = (pains.reduce((sum, entry) => sum + levelFor(entry), 0) / pains.length).toFixed(1);
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
      app: '小日子', version: 2, exportedAt: new Date().toISOString(),
      entries: state.entries, periods: state.periods, settings: state.settings
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
        state.periods = Array.isArray(backup.periods) ? normalizePeriods(backup.periods) : inferPeriodsFromEntries(validEntries);
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
    state.periods = [];
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
    const periodAction = event.target.closest('[data-period-action]');
    if (periodAction) {
      const target = { start: 'period_start', end: 'period_end', backfill: 'period_backfill' }[periodAction.dataset.periodAction];
      if (target) openRecord(target);
    }

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
