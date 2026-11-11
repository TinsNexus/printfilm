import { useEffect, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { Button } from '@/components/ui/button';
import { request, type Listing } from '@/features/marketplace/api';
import { formatNumber, tr, tRich } from "@/i18n";

type Product = { id: string; product_id: string; credit_fen: number; amount_fen: number; expected_prices: Record<string, number> };
const base = '/api/admin/marketplace/app';

export function AppleProductSettings() {
  const [presets, setPresets] = useState<Product[]>([]);
  const [items, setItems] = useState<Listing['items']>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    async function load() {
      const preset = await request<{ items: Product[] }>(`${base}/product-presets`);
      const rows: Listing['items'] = [];
      let page = 1;
      while (active) {
        const result = await request<Listing>(`${base}/products?page=${page}&page_size=100`);
        rows.push(...result.items);
        if (rows.length >= result.meta.total || !result.items.length) break;
        page += 1;
      }
      if (active) { setPresets(preset.items); setItems(rows); }
    }
    void load().catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  async function save(product: Product, enabled: boolean) {
    setBusy(product.id); setError(''); setMessage('');
    try {
      await request(`${base}/products`, 'PUT', { product_id: product.product_id, sku_id: product.id,
        coins: product.credit_fen, price_fen: product.amount_fen, expected_prices: product.expected_prices, enabled });
      setMessage(tr(enabled ? "appleSettings.productEnabledMsg" : "appleSettings.productDisabledMsg", { id: product.id }));
      setRevision(value => value + 1);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(''); }
  }

  return <SettingsPanel title={tr("appleSettings.productsTitle")} description={tr("appleSettings.productsDesc")}
    actions={<Button type="button" variant="outline" disabled={loading || Boolean(busy)} onClick={() => setRevision(value => value + 1)}>{tr("appleSettings.refreshProducts")}</Button>}>
    <p className="text-sm text-muted-foreground mb-4">{tRich(tr("appleSettings.productsNote"), { link: <a className="underline" href="https://appstoreconnect.apple.com/" target="_blank" rel="noopener noreferrer">App Store Connect</a> })}</p>
    {loading ? <p role="status">{tr("appleSettings.productsLoading")}</p> : <div className="grid gap-4 md:grid-cols-2">{presets.map(product => {
      const item = items.find(row => row.product_id === product.product_id);
      return <article key={product.id} className="rounded-lg border p-4 space-y-3">
        <h4 className="font-medium">{product.id} · {tr(item ? item.enabled ? "appleSettings.productAllowed" : "appleSettings.productDisabled" : "appleSettings.productUnregistered")}</h4>
        <p className="text-sm break-all">{product.product_id}</p>
        <p className="text-sm">{tr("appleSettings.productPrice", { cny: (product.expected_prices.CNY / 100).toFixed(2), usd: (product.expected_prices.USD / 100).toFixed(2) })}</p>
        <p className="text-sm">{tr("appleSettings.productCredit", { points: formatNumber(product.credit_fen), bonus: formatNumber(product.credit_fen - product.amount_fen) })}</p>
        <div className="flex flex-wrap gap-2">
          {!item && <Button type="button" variant="outline" disabled={Boolean(busy) || Boolean(error)} onClick={() => void save(product, false)}>{tr("appleSettings.registerProduct")}</Button>}
          {item && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void save(product, !item.enabled)}>{busy === product.id ? tr("appleSettings.saving") : item.enabled ? tr("appleSettings.stopTier") : tr("appleSettings.allowTier")}</Button>}
        </div>
      </article>;
    })}</div>}
    {error && <p role="alert" className="text-sm text-destructive mt-4">{error}</p>}
    {message && <p role="status" className="text-sm mt-4">{message}</p>}
  </SettingsPanel>;
}
