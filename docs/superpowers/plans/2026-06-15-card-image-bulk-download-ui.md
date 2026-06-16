> I'm using the writing-plans skill to create the implementation plan.

# Card Image Bulk Download UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a renderer UI control in the Settings page so users can start, pause, resume, and abort the bulk card-image pre-download feature exposed by `window.hdt.cardImages.bulkDownload`.

**Architecture:** Extend the existing `Settings` component with a new "Data & Sync" category and a `DataPanel` sub-component. `DataPanel` keeps local React state for the latest `BulkDownloadStatus`, subscribes to progress events, and delegates all actions to the preload API. No new store or backend changes are required.

**Tech Stack:** React, Tailwind CSS, `lucide-react`, project reference theme classes, vitest, React Testing Library.

---

## File Structure

- `apps/desktop/src/renderer/src/components/Settings.tsx` — add `Database` category, add `DataPanel` component, render it for the `data` category.
- `resources/locales/en-US.json` — add `settings.cardImages.*` translation keys.
- `resources/locales/zh-CN.json` — add `settings.cardImages.*` translation keys.
- `apps/desktop/src/renderer/tests/Settings.data.test.tsx` — new test file verifying category rendering, button click, and preload API invocation.

---

## Task 1: Add translation keys

**Files:**
- Modify: `resources/locales/en-US.json`
- Modify: `resources/locales/zh-CN.json`

- [ ] **Step 1: Add English strings**

Inside the existing `settings` object, add a `cardImages` entry after `about`:

```json
    "cardImages": {
      "title": "Card images",
      "description": "Pre-download all collectible card images (full art and tiles) so they appear instantly later.",
      "download": "Download",
      "resume": "Resume",
      "pause": "Pause",
      "abort": "Abort",
      "downloading": "Downloading…",
      "completed": "Completed",
      "completedWithErrors": "Completed with {count} errors",
      "failed": "Download failed",
      "diskSpaceError": "Not enough disk space",
      "unavailable": "Download service is unavailable"
    }
```

- [ ] **Step 2: Add Chinese strings**

Inside the existing `settings` object, add a `cardImages` entry after `about`:

```json
    "cardImages": {
      "title": "卡牌图片",
      "description": "提前下载所有可收集卡牌的完整卡图和缩略图，之后无需等待即可显示。",
      "download": "下载",
      "resume": "继续",
      "pause": "暂停",
      "abort": "中止",
      "downloading": "下载中…",
      "completed": "已完成",
      "completedWithErrors": "已完成，{count} 张失败",
      "failed": "下载失败",
      "diskSpaceError": "磁盘空间不足",
      "unavailable": "下载服务不可用"
    }
```

- [ ] **Step 3: Validate JSON syntax**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('resources/locales/en-US.json','utf8')); console.log('en-US ok')"
node -e "JSON.parse(require('fs').readFileSync('resources/locales/zh-CN.json','utf8')); console.log('zh-CN ok')"
```

Expected: both print `ok`.

- [ ] **Step 4: Commit**

```bash
git add resources/locales/en-US.json resources/locales/zh-CN.json
git commit -m "i18n: add card image bulk download settings strings"
```

---

## Task 2: Add Data category and DataPanel to Settings

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/Settings.tsx`

- [ ] **Step 1: Import the Database icon**

Add `Database` to the existing `lucide-react` import at the top of `Settings.tsx`:

```ts
import { Info, Monitor, Palette, Database } from 'lucide-react';
```

- [ ] **Step 2: Add the data category**

Change the `categories` array from:

```ts
const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'about', labelKey: 'settings.about.categoryLabel', icon: Info },
];
```

To:

```ts
const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'data', labelKey: 'settings.data', icon: Database },
  { id: 'about', labelKey: 'settings.about.categoryLabel', icon: Info },
];
```

- [ ] **Step 3: Render DataPanel for the data category**

In the `Settings` component JSX, find the `activeCategory === 'about'` block:

```tsx
            {activeCategory === 'about' && <AboutPanel />}
```

Change it to:

```tsx
            {activeCategory === 'data' && <DataPanel />}

            {activeCategory === 'about' && <AboutPanel />}
```

- [ ] **Step 4: Add the DataPanel component**

Insert the following component definition immediately before the `AboutPanel` function definition (before `function AboutPanel() {`):

```tsx
type BulkDownloadState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed-with-errors'
  | 'failed';

type BulkDownloadStatus = {
  state: BulkDownloadState;
  progress: {
    completed: number;
    total: number;
    failed: number;
    currentCardId: string | null;
  };
  stats: {
    downloadedRenders: number;
    downloadedTiles: number;
    skippedRenders: number;
    skippedTiles: number;
    failed: number;
  };
};

function DataPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BulkDownloadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api = typeof window !== 'undefined' ? window.hdt?.cardImages?.bulkDownload : undefined;

  useEffect(() => {
    let alive = true;
    setError(null);

    const refresh = async () => {
      try {
        const s = await api?.getStatus();
        if (alive && s) setStatus(s);
      } catch {
        // ignore
      }
    };
    void refresh();

    const unsubscribe = api?.onProgress((s) => {
      if (alive) setStatus(s);
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [api]);

  const run = async (action: 'start' | 'resume') => {
    setError(null);
    if (!api) {
      setError(t('settings.cardImages.unavailable'));
      return;
    }
    try {
      const result = await (action === 'start' ? api.start(['render', 'tile']) : api.resume());
      if (!result.ok) {
        if ('error' in result && result.error === 'insufficient-disk-space') {
          setError(t('settings.cardImages.diskSpaceError'));
        } else {
          setError(t('settings.cardImages.failed'));
        }
      } else {
        setStatus(result.status);
      }
    } catch {
      setError(t('settings.cardImages.failed'));
    }
  };

  const handlePause = () => {
    try {
      api?.pause();
    } catch {
      // ignore
    }
  };

  const handleAbort = () => {
    try {
      api?.abort();
    } catch {
      // ignore
    }
  };

  const progressText = status ? `${status.progress.completed}/${status.progress.total}` : '0/0';
  const percent =
    status && status.progress.total > 0
      ? Math.round((status.progress.completed / status.progress.total) * 100)
      : 0;

  const primaryLabel =
    status?.state === 'paused'
      ? t('settings.cardImages.resume')
      : status?.state === 'running'
        ? t('settings.cardImages.downloading')
        : t('settings.cardImages.download');

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SettingsRow
        title={t('settings.cardImages.title')}
        description={t('settings.cardImages.description')}
        control={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => run(status?.state === 'paused' ? 'resume' : 'start')}
              disabled={status?.state === 'running'}
              className="reference-action-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {primaryLabel}
            </button>
            {status?.state === 'running' && (
              <>
                <button type="button" onClick={handlePause} className="reference-ghost-button">
                  {t('settings.cardImages.pause')}
                </button>
                <button type="button" onClick={handleAbort} className="reference-ghost-button">
                  {t('settings.cardImages.abort')}
                </button>
              </>
            )}
          </div>
        }
      />

      {status && status.progress.total > 0 && (
        <div className="reference-panel px-5 py-4 space-y-2">
          <div className="reference-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="reference-progress-caption">
            {progressText} ({percent}%)
            {status.state === 'completed' && ` — ${t('settings.cardImages.completed')}`}
            {status.state === 'completed-with-errors' &&
              ` — ${t('settings.cardImages.completedWithErrors', { count: status.progress.failed })}`}
          </p>
        </div>
      )}

      {error && <p className="reference-settings-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck on the renderer package**

Run:

```bash
pnpm --filter @hdt/desktop typecheck
```

Expected: Only the pre-existing `Settings.tsx(121,22)` error remains; no new errors. If new errors reference missing `Database` export or `BulkDownloadStatus`, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/components/Settings.tsx
git commit -m "feat(settings): add card image bulk download data panel"
```

---

## Task 3: Add renderer test for the data panel

**Files:**
- Create: `apps/desktop/src/renderer/tests/Settings.data.test.tsx`

- [ ] **Step 1: Create the failing test file**

Create `apps/desktop/src/renderer/tests/Settings.data.test.tsx` with:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { Settings } from '../src/components/Settings';

function renderSettings(locale?: string) {
  return render(
    <I18nProvider {...(locale ? { preference: locale as 'en-US' | 'zh-CN' } : {})}>
      <Settings />
    </I18nProvider>,
  );
}

describe('Settings — Data category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    const onProgress = vi.fn();
    (window as unknown as { hdt: unknown }).hdt = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.0'),
      },
      about: {
        checkForUpdates: vi.fn().mockResolvedValue({ state: 'up-to-date' }),
        openLicense: vi.fn().mockResolvedValue(true),
        openThirdPartyNotices: vi.fn().mockResolvedValue(true),
      },
      cardImages: {
        bulkDownload: {
          getStatus: vi.fn().mockResolvedValue({
            state: 'idle',
            progress: { completed: 0, total: 0, failed: 0, currentCardId: null },
            stats: {
              downloadedRenders: 0,
              downloadedTiles: 0,
              skippedRenders: 0,
              skippedTiles: 0,
              failed: 0,
            },
          }),
          start: vi.fn().mockResolvedValue({
            ok: true,
            status: {
              state: 'running',
              progress: { completed: 0, total: 100, failed: 0, currentCardId: null },
              stats: {
                downloadedRenders: 0,
                downloadedTiles: 0,
                skippedRenders: 0,
                skippedTiles: 0,
                failed: 0,
              },
            },
          }),
          pause: vi.fn(),
          resume: vi.fn(),
          abort: vi.fn(),
          onProgress,
        },
      },
    };
  });

  it('renders the data category and starts a download', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Data & Sync' }));

    await waitFor(() => {
      expect(screen.getByText('Card images')).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: 'Download' });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(window.hdt.cardImages.bulkDownload.start).toHaveBeenCalledWith(['render', 'tile']);
    });
  });

  it('renders Chinese strings under zh-CN', async () => {
    renderSettings('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '数据与同步' }));

    await waitFor(() => {
      expect(screen.getByText('卡牌图片')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new test and expect it to fail**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Settings.data.test.tsx
```

Expected: FAIL — `Settings.data.test.tsx` cannot be found or the new category / panel is not yet implemented.

- [ ] **Step 3: Run the test after implementing Task 2**

After completing Task 2, run the same command again.

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/tests/Settings.data.test.tsx
git commit -m "test(settings): add card image bulk download data panel tests"
```

---

## Task 4: Final verification

**Files:**
- All changed files above.

- [ ] **Step 1: Run renderer tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Settings.data.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @hdt/desktop typecheck
```

Expected: Only the pre-existing `Settings.tsx(121,22)` error remains; no new errors.

- [ ] **Step 3: Run lint on changed files**

Run:

```bash
pnpm exec eslint --no-cache apps/desktop/src/renderer/src/components/Settings.tsx apps/desktop/src/renderer/tests/Settings.data.test.tsx
```

Expected: no errors.

- [ ] **Step 4: Smoke test the dev build**

Run the dev server briefly:

```bash
timeout 120 pnpm dev
```

Open Settings → Data & Sync, confirm the "Card images" row appears and clicking Download starts the run. Then stop the dev server.

- [ ] **Step 5: Final commit if any fixes were needed**

If any fixes were made during verification:

```bash
git add -A
git commit -m "fix(settings): card image bulk download UI verification fixes"
```

---

## Plan Self-Review

- **Spec coverage:** Every requirement in the design doc is mapped to a task: category placement (Task 2), state buttons/progress (Task 2), i18n (Task 1), error messages (Task 2), testing (Task 3), verification (Task 4).
- **Placeholder scan:** No TBD/TODO placeholders; every code block and command is explicit.
- **Type consistency:** `BulkDownloadStatus` shape matches the main-process `BulkDownloadStatus`. `window.hdt.cardImages.bulkDownload.start` is called with `['render', 'tile']`.
