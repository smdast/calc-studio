import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@fontsource-variable/figtree';
import './styles.css';

import { AppShell } from '@astryxdesign/core/AppShell';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Brackets, Calculator as CalculatorIcon, ChartNoAxesCombined, Download, Equal, Moon, Sun } from 'lucide-react';
import { Calculator } from './Calculator';
import { LinearAlgebraTool } from './MathTools';
import { GraphTool } from './GraphTool';
import { SystemTool } from './SystemTool';
import type { HistoryEntry } from './model';
import { useSaved } from './persistence';

type InstallPrompt = Event & { prompt(): Promise<unknown> };

const modes = [
  { id: 'calculator', label: '関数電卓', icon: CalculatorIcon, detail: '関数計算、微分・積分、方程式をひとつの電卓で。' },
  { id: 'system', label: '連立方程式', icon: Equal, detail: '2～4元の連立一次方程式を、係数から解きます。' },
  { id: 'linear', label: '行列・ベクトル', icon: Brackets, detail: 'セルに成分を入力して、行列やベクトルを計算します。' },
  { id: 'graph', label: 'グラフ', icon: ChartNoAxesCombined, detail: '式から曲線を描き、零点・極値・接線を調べます。' },
] as const;
type Mode = typeof modes[number]['id'];

function App() {
  const [mode, setMode] = useState<Mode>('calculator');
  const [visited, setVisited] = useState<Mode[]>(['calculator']);
  const [theme, setTheme] = useSaved<'system' | 'light' | 'dark'>('theme', 'system');
  const [history, setHistory] = useSaved<HistoryEntry[]>('history', []);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [prefersDark, setPrefersDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const prepare = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const reset = () => setInstallPrompt(undefined);
    window.addEventListener('beforeinstallprompt', prepare);
    window.addEventListener('appinstalled', reset);
    return () => {
      window.removeEventListener('beforeinstallprompt', prepare);
      window.removeEventListener('appinstalled', reset);
    };
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);

  function select(id: string) {
    const next = id as Mode;
    setMode(next);
    setVisited(current => current.includes(next) ? current : [...current, next]);
  }
  const header = <header className="app-header">
    <div className="header-inner">
      <div className="brand">
        <span className="brand-mark"><CalculatorIcon size={21} strokeWidth={2} /></span>
        <span>Calc Studio</span>
      </div>
      <div className="header-actions">
        {installPrompt && <IconButton label="アプリをインストール" tooltip="アプリをインストール"
          variant="ghost" className="theme-toggle" icon={<Download size={19} />}
          onClick={() => {
            setInstallPrompt(undefined);
            void installPrompt.prompt().catch(() => {});
          }} />}
        <IconButton label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
          tooltip={dark ? 'ライトモード' : 'ダークモード'} variant="ghost" className="theme-toggle"
          icon={dark ? <Sun size={19} /> : <Moon size={19} />} onClick={() => setTheme(dark ? 'light' : 'dark')} />
      </div>
    </div>
    <div className="navigation">
      <TabList aria-label="計算モード" value={mode} onChange={select} size="lg" role="tablist" className="mode-tabs">
        {modes.map(({ id, label, icon: Icon }) => <Tab key={id} id={'tab-' + id} value={id} label={label}
          panelId={'panel-' + id} icon={<Icon size={17} strokeWidth={1.9} />} />)}
      </TabList>
    </div>
  </header>;
  return <Theme theme={neutralTheme} mode={dark ? 'dark' : 'light'}>
    <AppShell className="app-shell" topNav={header} contentPadding={0} variant="wash">
      <div className="workspace">
        {modes.map(({ id, label, detail }) => <section key={id} id={'panel-' + id} role="tabpanel"
          aria-labelledby={'tab-' + id} hidden={mode !== id}>
          {visited.includes(id) && <>
            <div className="workspace-heading"><h1>{label}</h1><p>{detail}</p></div>
            {id === 'calculator' && <Calculator active={mode === id} history={history} setHistory={setHistory} />}
            {id === 'system' && <SystemTool history={history} setHistory={setHistory} />}
            {id === 'linear' && <LinearAlgebraTool />}
            {id === 'graph' && <GraphTool dark={dark} active={mode === id} />}
          </>}
        </section>)}
      </div>
    </AppShell>
  </Theme>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const worker = new URL('sw.js', document.baseURI);
    void navigator.serviceWorker.register(worker).catch(error => {
      console.warn('オフライン用のサービスワーカーを登録できませんでした。', error);
    });
  }, { once: true });
}
