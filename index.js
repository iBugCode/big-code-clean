const STORAGE_KEY = 'code-clean-schemes';
const LAST_SCHEME_KEY = 'code-clean-last-scheme';

const DEFAULT_SCHEMES = [
    {
        id: 'tab-to-space',
        name: 'Tab转空格',
        rules: [{ type: 'text', from: '\t', to: '    ' }]
    },
    {
        id: 'trim-trailing',
        name: '去除行尾空格',
        rules: [{ type: 'regex', from: '\\s+$', to: '', flags: 'gm' }]
    },
    {
        id: 'remove-comments',
        name: '去除注释',
        rules: [
            { type: 'regex', from: '//.*', to: '', flags: 'g' },
            { type: 'regex', from: '/\\*[\\s\\S]*?\\*/', to: '', flags: 'g' },
            { type: 'regex', from: '/<!--[\\s\\S]*?-->/', to: '', flags: 'g' }
        ]
    }
];

let originalCode = '';
let schemes = [];
let currentSchemeId = '';
let editingSchemeId = null;

const $ = id => document.getElementById(id);

const codeInput = $('code-input');
const highlightedCode = $('highlighted-code');
const highlightLayer = document.querySelector('.highlight-layer');
const schemeTagsEl = $('scheme-tags');
const addSchemeBtn = $('add-scheme-btn');
const modalOverlay = $('modal-overlay');
const modalTitle = $('modal-title');
const schemeNameInput = $('scheme-name');
const rulesList = $('rules-list');
const addRuleBtn = $('add-rule-btn');
const btnCancel = $('btn-cancel');
const btnSave = $('btn-save');
const toastEl = $('toast');

// --- 持久化 ---

function loadSchemes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        schemes = raw ? JSON.parse(raw) : DEFAULT_SCHEMES.map(s => ({ ...s }));
        if (!schemes.length) schemes = DEFAULT_SCHEMES.map(s => ({ ...s }));
    } catch {
        schemes = DEFAULT_SCHEMES.map(s => ({ ...s }));
    }
}

function saveSchemes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schemes));
}

// --- 渲染 ---

function renderSchemeTags() {
    schemeTagsEl.innerHTML = '';
    schemes.forEach(scheme => {
        const tag = document.createElement('button');
        tag.className = 'scheme-tag' + (scheme.id === currentSchemeId ? ' active' : '');
        tag.dataset.id = scheme.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tag-name';
        nameSpan.textContent = scheme.name;

        const actionsSpan = document.createElement('span');
        actionsSpan.className = 'tag-actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.title = '编辑';
        editBtn.addEventListener('click', e => {
            e.stopPropagation();
            openEditModal(scheme.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            deleteScheme(scheme.id);
        });

        actionsSpan.append(editBtn, deleteBtn);
        tag.append(nameSpan, actionsSpan);

        tag.addEventListener('click', () => selectScheme(scheme.id));
        schemeTagsEl.appendChild(tag);
    });
}

function updateActiveTag() {
    schemeTagsEl.querySelectorAll('.scheme-tag').forEach(tag => {
        tag.classList.toggle('active', tag.dataset.id === currentSchemeId);
    });
}

// --- 核心逻辑 ---

function selectScheme(id) {
    currentSchemeId = id;
    localStorage.setItem(LAST_SCHEME_KEY, id);
    updateActiveTag();
    if (originalCode) {
        cleanCode();
        codeInput.select();
    }
}

function cleanCode() {
    const scheme = schemes.find(s => s.id === currentSchemeId);
    if (!scheme || !originalCode) return;

    let cleaned = originalCode;
    for (const rule of scheme.rules) {
        if (!rule.from) continue;
        try {
            if (rule.type === 'regex') {
                const regex = new RegExp(rule.from, rule.flags || 'g');
                cleaned = cleaned.replace(regex, rule.to);
            } else {
                cleaned = cleaned.split(rule.from).join(rule.to);
            }
        } catch (err) {
            console.warn('规则执行失败:', rule, err);
        }
    }

    codeInput.value = cleaned;
    updateHighlight(cleaned);
}

function updateHighlight(code) {
    if (code) {
        const result = hljs.highlightAuto(code);
        highlightedCode.innerHTML = result.value;
    } else {
        highlightedCode.innerHTML = '';
    }
}

function showToast(message, duration = 2000) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
}

function copyCleanedCode() {
    const text = codeInput.value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('复制成功');
    }).catch(() => {
        showToast('复制失败，请手动复制');
    });
}

// --- 方案 CRUD ---

function openAddModal() {
    editingSchemeId = null;
    modalTitle.textContent = '添加清洗方案';
    schemeNameInput.value = '';
    rulesList.innerHTML = '';
    addRuleItem();
    modalOverlay.classList.add('show');
    schemeNameInput.focus();
}

function openEditModal(id) {
    const scheme = schemes.find(s => s.id === id);
    if (!scheme) return;

    editingSchemeId = id;
    modalTitle.textContent = '编辑清洗方案';
    schemeNameInput.value = scheme.name;
    rulesList.innerHTML = '';
    scheme.rules.forEach(rule => addRuleItem(rule));
    modalOverlay.classList.add('show');
    schemeNameInput.focus();
}

function deleteScheme(id) {
    schemes = schemes.filter(s => s.id !== id);
    saveSchemes();
    if (currentSchemeId === id) {
        currentSchemeId = schemes.length ? schemes[0].id : '';
    }
    renderSchemeTags();
    if (originalCode && currentSchemeId) cleanCode();
}

function saveScheme() {
    const name = schemeNameInput.value.trim();
    if (!name) {
        showToast('请输入方案名称');
        schemeNameInput.focus();
        return;
    }

    const rules = [];
    rulesList.querySelectorAll('.rule-item').forEach(item => {
        const type = item.querySelector('.rule-type').value;
        const from = item.querySelector('.rule-from').value;
        const to = item.querySelector('.rule-to').value;
        const flags = item.querySelector('.rule-flags')?.value || '';
        if (from) {
            rules.push({ type, from, to, flags });
        }
    });

    if (!rules.length) {
        showToast('请至少添加一条规则');
        return;
    }

    // 验证正则
    for (const rule of rules) {
        if (rule.type === 'regex') {
            try {
                new RegExp(rule.from, rule.flags || 'g');
            } catch {
                showToast(`正则语法错误: ${rule.from}`);
                return;
            }
        }
    }

    if (editingSchemeId) {
        const scheme = schemes.find(s => s.id === editingSchemeId);
        if (scheme) {
            scheme.name = name;
            scheme.rules = rules;
        }
    } else {
        schemes.push({ id: Date.now().toString(), name, rules });
    }

    saveSchemes();
    renderSchemeTags();
    updateActiveTag();
    modalOverlay.classList.remove('show');

    if (!currentSchemeId && schemes.length) {
        currentSchemeId = schemes[0].id;
        updateActiveTag();
    }
}

function addRuleItem(rule = null) {
    const item = document.createElement('div');
    item.className = 'rule-item';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'rule-type';
    typeSelect.innerHTML = `
        <option value="text" ${rule?.type !== 'regex' ? 'selected' : ''}>文本</option>
        <option value="regex" ${rule?.type === 'regex' ? 'selected' : ''}>正则</option>
    `;

    const fromInput = document.createElement('input');
    fromInput.className = 'rule-from';
    fromInput.type = 'text';
    fromInput.placeholder = '查找内容';
    if (rule) fromInput.value = rule.from;

    const toInput = document.createElement('input');
    toInput.className = 'rule-to';
    toInput.type = 'text';
    toInput.placeholder = '替换为';
    if (rule) toInput.value = rule.to;

    const flagsInput = document.createElement('input');
    flagsInput.className = 'rule-flags flags-input';
    flagsInput.type = 'text';
    flagsInput.placeholder = 'gi';
    flagsInput.title = '正则标志 (g, i, m 等)';
    flagsInput.style.display = rule?.type === 'regex' ? '' : 'none';
    if (rule?.flags) flagsInput.value = rule.flags;

    typeSelect.addEventListener('change', () => {
        flagsInput.style.display = typeSelect.value === 'regex' ? '' : 'none';
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-rule';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => item.remove());

    item.append(typeSelect, fromInput, toInput, flagsInput, deleteBtn);
    rulesList.appendChild(item);

    if (!rule) fromInput.focus();
}

// --- 事件 ---

codeInput.addEventListener('paste', () => {
    setTimeout(() => {
        originalCode = codeInput.value;
        if (originalCode && currentSchemeId) {
            cleanCode();
        } else {
            updateHighlight(originalCode);
        }
        codeInput.select();
    }, 0);
});

codeInput.addEventListener('dblclick', copyCleanedCode);

codeInput.addEventListener('scroll', () => {
    highlightLayer.scrollTop = codeInput.scrollTop;
    highlightLayer.scrollLeft = codeInput.scrollLeft;
});

addSchemeBtn.addEventListener('click', openAddModal);
addRuleBtn.addEventListener('click', () => addRuleItem());
btnCancel.addEventListener('click', () => modalOverlay.classList.remove('show'));
btnSave.addEventListener('click', saveScheme);

modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('show');
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('show')) {
        modalOverlay.classList.remove('show');
    }
});

// --- 初始化 ---

loadSchemes();
renderSchemeTags();
const lastSchemeId = localStorage.getItem(LAST_SCHEME_KEY);
if (schemes.length) {
    currentSchemeId = (lastSchemeId && schemes.some(s => s.id === lastSchemeId))
        ? lastSchemeId
        : schemes[0].id;
    updateActiveTag();
}
