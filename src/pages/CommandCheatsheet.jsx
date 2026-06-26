import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';

const inputStyle = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
};

const CUSTOM_CATEGORY = '我的指令';

// Built-in cheatsheet. Each item: { category, cmd, desc }.
const BUILTIN = [
  // ---- Git / GitHub ----
  { category: 'Git / GitHub', cmd: 'git clone <url>', desc: '把遠端倉庫複製到本機' },
  { category: 'Git / GitHub', cmd: 'git status', desc: '查看目前有哪些變更／未追蹤檔案' },
  { category: 'Git / GitHub', cmd: 'git add .', desc: '把所有變更加入暫存區（準備 commit）' },
  { category: 'Git / GitHub', cmd: 'git add <file>', desc: '只把指定檔案加入暫存區' },
  { category: 'Git / GitHub', cmd: 'git commit -m "訊息"', desc: '把暫存區的變更提交成一個版本' },
  {
    category: 'Git / GitHub',
    cmd: 'git commit -am "訊息"',
    desc: '已追蹤檔案一步完成 add + commit',
  },
  { category: 'Git / GitHub', cmd: 'git push', desc: '把本機 commit 推送到遠端（GitHub）' },
  {
    category: 'Git / GitHub',
    cmd: 'git push -u origin <branch>',
    desc: '首次推送並建立分支追蹤，之後可直接 git push',
  },
  { category: 'Git / GitHub', cmd: 'git pull', desc: '把遠端最新變更拉回並合併到本機' },
  { category: 'Git / GitHub', cmd: 'git fetch', desc: '只抓取遠端更新、先不合併（可先檢視）' },
  { category: 'Git / GitHub', cmd: 'git branch', desc: '列出所有本機分支' },
  {
    category: 'Git / GitHub',
    cmd: 'git switch -c <name>',
    desc: '建立並切換到新分支（等同 git checkout -b）',
  },
  { category: 'Git / GitHub', cmd: 'git switch <branch>', desc: '切換到既有分支' },
  { category: 'Git / GitHub', cmd: 'git merge <branch>', desc: '把指定分支合併進目前分支' },
  {
    category: 'Git / GitHub',
    cmd: 'git rebase <branch>',
    desc: '把目前分支的提交移到指定分支之上（線性歷史）',
  },
  { category: 'Git / GitHub', cmd: 'git stash', desc: '暫存目前未提交的變更，讓工作區乾淨' },
  { category: 'Git / GitHub', cmd: 'git stash pop', desc: '取回最近一次 stash 的變更' },
  {
    category: 'Git / GitHub',
    cmd: 'git reset --soft HEAD~1',
    desc: '撤銷最後一次 commit，但保留變更在暫存區',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git reset --hard HEAD~1',
    desc: '撤銷最後一次 commit 並丟棄變更（危險，不可復原）',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git revert <commit>',
    desc: '用一個新 commit 來反轉某次提交（安全、保留歷史）',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git restore <file>',
    desc: '把檔案還原成上次提交的內容（丟棄未存變更）',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git log --oneline --graph --all',
    desc: '用簡潔圖形方式檢視提交歷史與分支',
  },
  { category: 'Git / GitHub', cmd: 'git diff', desc: '查看尚未暫存的具體差異' },
  { category: 'Git / GitHub', cmd: 'git remote -v', desc: '查看目前設定的遠端網址' },
  {
    category: 'Git / GitHub',
    cmd: 'git remote add origin <url>',
    desc: '為本機倉庫新增名為 origin 的遠端',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git push --force-with-lease',
    desc: '安全的強制推送（rebase 後常用，不會蓋掉別人的提交）',
  },
  {
    category: 'Git / GitHub',
    cmd: 'git tag v1.0.0 && git push --tags',
    desc: '建立版本標籤並推送到遠端',
  },
  {
    category: 'Git / GitHub',
    cmd: 'gh repo create <name> --public --source=. --push',
    desc: '用 GitHub CLI 直接建立遠端倉庫並推送目前資料夾',
  },
  {
    category: 'Git / GitHub',
    cmd: 'gh pr create',
    desc: '用 GitHub CLI 從目前分支建立 Pull Request',
  },

  // ---- npm / Node ----
  { category: 'npm / Node', cmd: 'npm install', desc: '依 package.json 安裝全部相依套件' },
  { category: 'npm / Node', cmd: 'npm install <pkg>', desc: '安裝套件並寫入 dependencies' },
  {
    category: 'npm / Node',
    cmd: 'npm install -D <pkg>',
    desc: '安裝為開發相依（devDependencies）',
  },
  { category: 'npm / Node', cmd: 'npm install -g <pkg>', desc: '全域安裝（提供 CLI 指令用）' },
  {
    category: 'npm / Node',
    cmd: 'npm run dev',
    desc: '執行 package.json scripts 裡的 dev（開發伺服器）',
  },
  { category: 'npm / Node', cmd: 'npm run build', desc: '執行 build 腳本，產生正式版輸出' },
  { category: 'npm / Node', cmd: 'npm init -y', desc: '用預設值快速產生 package.json' },
  { category: 'npm / Node', cmd: 'npx <pkg>', desc: '不安裝、直接執行某個套件的 CLI' },
  { category: 'npm / Node', cmd: 'npm ci', desc: '依 package-lock 乾淨重裝（CI／重現環境用）' },
  { category: 'npm / Node', cmd: 'npm outdated', desc: '列出有新版本可更新的套件' },
  { category: 'npm / Node', cmd: 'npm audit fix', desc: '自動修補已知的安全性漏洞' },
  { category: 'npm / Node', cmd: 'npm uninstall <pkg>', desc: '移除套件並更新 package.json' },

  // ---- Python ----
  { category: 'Python', cmd: 'python -m venv venv', desc: '建立名為 venv 的虛擬環境' },
  {
    category: 'Python',
    cmd: 'venv\\Scripts\\activate',
    desc: '啟用虛擬環境（Windows PowerShell/CMD）',
  },
  { category: 'Python', cmd: 'pip install <pkg>', desc: '安裝 Python 套件' },
  { category: 'Python', cmd: 'pip install -r requirements.txt', desc: '依清單一次安裝全部相依' },
  { category: 'Python', cmd: 'pip freeze > requirements.txt', desc: '把目前環境的套件匯出成清單' },
  { category: 'Python', cmd: 'python script.py', desc: '執行 Python 腳本' },
  {
    category: 'Python',
    cmd: 'python -m <module>',
    desc: '以模組方式執行（例如 python -m http.server）',
  },

  // ---- 編譯：通用語言 ----
  { category: '編譯指令', cmd: 'gcc main.c -o main', desc: 'C：編譯成執行檔 main' },
  { category: '編譯指令', cmd: 'g++ main.cpp -o main', desc: 'C++：編譯成執行檔 main' },
  {
    category: '編譯指令',
    cmd: 'cmake -B build && cmake --build build',
    desc: 'C/C++（CMake）：設定並建置到 build 資料夾',
  },
  { category: '編譯指令', cmd: 'javac Main.java && java Main', desc: 'Java：編譯後執行 Main 類別' },
  { category: '編譯指令', cmd: 'cargo run', desc: 'Rust：建置並執行（cargo build 只建置）' },
  { category: '編譯指令', cmd: 'go run main.go', desc: 'Go：直接編譯並執行（go build 只建置）' },
  { category: '編譯指令', cmd: 'dotnet run', desc: 'C#：建置並執行專案' },

  // ---- 編譯：電機／嵌入式（本機已安裝工具鏈）----
  {
    category: '編譯指令',
    cmd: 'arduino-cli compile --fqbn arduino:avr:uno sketch',
    desc: 'Arduino：編譯 sketch 資料夾（板型 Uno）',
  },
  {
    category: '編譯指令',
    cmd: 'arduino-cli upload -p COM3 --fqbn arduino:avr:uno sketch',
    desc: 'Arduino：上傳到開發板（COM3 改成你的埠）',
  },
  {
    category: '編譯指令',
    cmd: 'iverilog -o sim.out top.v tb_top.v && vvp sim.out',
    desc: 'Verilog：用 Icarus 編譯並執行模擬',
  },
  {
    category: '編譯指令',
    cmd: 'ghdl -a top.vhd && ghdl -e top && ghdl -r top',
    desc: 'VHDL：GHDL 分析→建構→執行模擬',
  },
  {
    category: '編譯指令',
    cmd: 'arm-none-eabi-gcc -c -mcpu=cortex-m4 -mthumb main.c -o main.o',
    desc: 'STM32：用 ARM GCC 把 C 編譯成目標檔',
  },
  {
    category: '編譯指令',
    cmd: 'octave --no-gui script.m',
    desc: 'MATLAB/Octave：以無視窗模式執行 .m 腳本',
  },
];

export default function CommandCheatsheet() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('全部');
  const [settings, setSettings] = useState(null);
  const [custom, setCustom] = useState([]);
  const [form, setForm] = useState({ cmd: '', desc: '' });

  useEffect(() => {
    if (!window.api?.getSettings) return;
    window.api
      .getSettings()
      .then((res) => {
        if (res?.ok) {
          setSettings(res.settings);
          setCustom(Array.isArray(res.settings.cheatsheet) ? res.settings.cheatsheet : []);
        }
      })
      .catch(() => {});
  }, []);

  const all = useMemo(
    () => [
      ...BUILTIN,
      ...custom.map((c, i) => ({
        category: c.category || CUSTOM_CATEGORY,
        cmd: c.cmd,
        desc: c.desc,
        custom: true,
        idx: i,
      })),
    ],
    [custom],
  );

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(all.map((x) => x.category)))],
    [all],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = all.filter((x) => {
      if (activeCat !== '全部' && x.category !== activeCat) return false;
      if (!q) return true;
      return `${x.cmd} ${x.desc} ${x.category}`.toLowerCase().includes(q);
    });
    const map = new Map();
    for (const x of filtered) {
      if (!map.has(x.category)) map.set(x.category, []);
      map.get(x.category).push(x);
    }
    return Array.from(map.entries());
  }, [all, query, activeCat]);

  const totalShown = grouped.reduce((sum, [, items]) => sum + items.length, 0);

  const copy = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('已複製指令', 'ok');
    } catch (_) {
      toast('複製失敗，請手動選取', 'error');
    }
  };

  const persist = async (next) => {
    setCustom(next);
    if (!settings || !window.api?.saveSettings) return;
    const res = await window.api.saveSettings({ ...settings, cheatsheet: next });
    if (res?.ok) setSettings({ ...settings, cheatsheet: next });
    else toast(res?.error || '儲存失敗', 'error');
  };

  const addCustom = async () => {
    const cmd = form.cmd.trim();
    if (!cmd) {
      toast('請先輸入指令', 'error');
      return;
    }
    await persist([...custom, { category: CUSTOM_CATEGORY, cmd, desc: form.desc.trim() }]);
    setForm({ cmd: '', desc: '' });
    toast('已加入「我的指令」', 'ok');
  };

  const removeCustom = async (idx) => {
    await persist(custom.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <PageHeader
        eyebrow="REFERENCE"
        title="指令大全"
        description="查詢 Git / GitHub、npm、Python 與各語言編譯指令，每條都有用途說明，點「複製」即可貼到終端機。也可新增自己的常用指令。"
        actions={
          <StatusBadge tone="muted">
            {totalShown} / {all.length} 條
          </StatusBadge>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋指令或用途，例如：push、安裝、編譯、ghdl..."
        />
        <div className="filter-row" style={{ marginTop: 12 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip ${activeCat === cat ? 'active' : ''}`}
              onClick={() => setActiveCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </Card>

      <Card title="新增我的指令" icon="＋" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{
              ...inputStyle,
              flex: '2 1 280px',
              fontFamily: '"Cascadia Code","Consolas",monospace',
            }}
            value={form.cmd}
            onChange={(e) => setForm({ ...form, cmd: e.target.value })}
            placeholder="指令，例如 git push origin main"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustom();
            }}
          />
          <input
            style={{ ...inputStyle, flex: '2 1 240px' }}
            value={form.desc}
            onChange={(e) => setForm({ ...form, desc: e.target.value })}
            placeholder="用途說明（選填）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustom();
            }}
          />
          <Button variant="primary" onClick={addCustom}>
            新增
          </Button>
        </div>
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            title="找不到符合的指令"
            description="換個關鍵字，或把分類切回「全部」再試一次。"
          />
        </Card>
      ) : (
        grouped.map(([category, items]) => (
          <Card key={category} title={category} style={{ marginBottom: 16 }}>
            <div className="cheatsheet-list">
              {items.map((item, index) => (
                <div
                  key={`${category}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <code
                      style={{
                        display: 'block',
                        fontFamily: '"Cascadia Code","Consolas",monospace',
                        fontSize: 13,
                        color: 'var(--accent)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.cmd}
                    </code>
                    {item.desc ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {item.desc}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button size="sm" variant="ghost" onClick={() => copy(item.cmd)}>
                      複製
                    </Button>
                    {item.custom ? (
                      <Button size="sm" variant="danger" onClick={() => removeCustom(item.idx)}>
                        刪除
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
