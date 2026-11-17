import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  X,
} from "lucide-react";
import { api, errText, getToken } from "./driverApi";

// ملف عامل التوصيل الكامل للمشرف
const CATEGORY = {
  any: "أي محل",
  restaurants: "مطعم",
  supermarket: "سوبرماركت",
  pharmacy: "صيدلية",
  library: "مكتبة",
  diesel: "مازوت",
  gas: "غاز",
  other: "غير ذلك",
};
const ORDER_STATUS = {
  assigned: ["استلمه", "bg-amber-100 text-amber-800"],
  buying: ["عم يشتري", "bg-violet-100 text-violet-800"],
  on_the_way: ["بالطريق", "bg-orange-100 text-orange-800"],
  delivered: ["وصل", "bg-emerald-100 text-emerald-800"],
  cancelled: ["ملغى", "bg-slate-100 text-slate-500"],
  new: ["بانتظار", "bg-navy-50 text-navy/60"],
};
const OFFER_STATUS = {
  accepted: ["قبله", "bg-emerald-100 text-emerald-800"],
  declined: ["رفضه", "bg-rose-100 text-rose-700"],
  expired: ["ما ردّ", "bg-amber-100 text-amber-800"],
  cancelled: ["انسحب العرض", "bg-slate-100 text-slate-500"],
  pending: ["عم يرن هلق", "bg-brand/10 text-brand"],
};
const fmt = (n) => new Intl.NumberFormat("en-US").format(n || 0);
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("ar-SY-u-nu-latn", {
        timeZone: "Asia/Damascus",
        day: "numeric",
        month: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
const date = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("ar-SY-u-nu-latn", {
        timeZone: "Asia/Damascus",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
function ago(iso) {
  if (!iso) return "ما فتح التطبيق بعد";
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "هلق";
  if (s < 3600) return `من ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `من ${Math.floor(s / 3600)} ساعة`;
  return `من ${Math.floor(s / 86400)} يوم`;
}

export default function CourierFile({ courierId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("orders");
  const [doc, setDoc] = useState(null); // { label, url }

  useEffect(() => {
    let alive = true;
    api(`/sup/couriers/${courierId}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errText(e)));
    return () => {
      alive = false;
    };
  }, [courierId]);

  const openDoc = async (kind, label) => {
    setDoc({ label, url: null });
    try {
      const r = await fetch(
        `/api/courier/sup/couriers/${courierId}/doc/${kind}`,
        { headers: { authorization: `Bearer ${getToken()}` } },
      );
      if (!r.ok) throw new Error();
      setDoc({ label, url: URL.createObjectURL(await r.blob()) });
    } catch {
      setDoc({ label, url: "", error: true });
    }
  };

  const c = data?.courier;
  const s = data?.stats;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50"
      onClick={onClose}
    >
      <div
        className="pb-safe flex h-[94%] w-full max-w-md flex-col rounded-t-3xl bg-navy-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-lg font-extrabold">ملف عامل التوصيل</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
          >
            <X size={18} />
          </button>
        </div>

        {!data && !error && (
          <div className="flex flex-1 items-center justify-center">
            <LoaderCircle className="animate-spin text-brand" />
          </div>
        )}
        {error && (
          <p className="m-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        {c && (
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
            {/* الهوية */}
            <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
              {c.photo ? (
                <img
                  src={c.photo}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl font-extrabold">
                  {c.name.trim()[0]}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold">{c.name}</p>
                <p
                  className="font-en text-sm text-navy/60"
                  dir="ltr"
                  style={{ textAlign: "right" }}
                >
                  {c.phone}
                </p>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold">
                  <span
                    className={`rounded-full px-2 py-0.5 ${c.online ? "bg-emerald-100 text-emerald-700" : "bg-navy-50 text-navy/50"}`}
                  >
                    {c.online ? "متاح" : "غير متاح"}
                  </span>
                  {!c.active && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                      موقوف من الإدارة
                    </span>
                  )}
                  {c.supervisor && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-brand">
                      مشرف
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <a
                  href={`tel:${c.phone}`}
                  aria-label="اتصال"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-navy"
                >
                  <Phone size={15} />
                </a>
                <a
                  href={`https://wa.me/963${c.phone.slice(1)}`}
                  aria-label="واتساب"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-emerald-600"
                >
                  <MessageCircle size={15} />
                </a>
              </div>
            </div>

            {/* الأرقام */}
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="وصّل اليوم"
                value={s.today.n}
                sub={`${fmt(s.today.fees)} أجور توصيل`}
                strong
              />
              <Stat
                label="آخر 7 أيام"
                value={s.week.n}
                sub={`${fmt(s.week.fees)} أجور توصيل`}
              />
              <Stat
                label="آخر 30 يوم"
                value={s.month.n}
                sub={`${fmt(s.month.fees)} أجور توصيل`}
              />
              <Stat
                label="من أول يوم"
                value={s.all.n}
                sub={`${fmt(s.all.fees)} أجور توصيل`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="نسبة القبول"
                value={
                  s.offers30.acceptRate == null
                    ? "—"
                    : `${s.offers30.acceptRate}%`
                }
                sub="آخر 30 يوم"
              />
              <Stat
                label="التقييم"
                value={
                  s.rating.avg ? (
                    <span className="inline-flex items-center gap-1">
                      {s.rating.avg}{" "}
                      <Star
                        size={14}
                        className="fill-amber-400 text-amber-400"
                      />
                    </span>
                  ) : (
                    "—"
                  )
                }
                sub={`${s.rating.count} تقييم`}
              />
              <Stat label="معه هلق" value={s.open} sub="طلب مفتوح" />
            </div>

            <div className="rounded-2xl bg-white p-3 text-xs shadow-soft">
              <p className="mb-2 font-extrabold">
                الطلبات اللي إجته (آخر 30 يوم)
              </p>
              <div className="grid grid-cols-4 gap-1 text-center">
                <Mini n={s.offers30.total} l="وصله" />
                <Mini n={s.offers30.accepted} l="قبلها" c="text-emerald-700" />
                <Mini n={s.offers30.declined} l="رفضها" c="text-rose-600" />
                <Mini n={s.offers30.expired} l="ما ردّ" c="text-amber-700" />
              </div>
              {s.cancelled30 > 0 && (
                <p className="mt-2 text-navy/55">
                  انلغى من طلباته {s.cancelled30} طلب بآخر 30 يوم
                </p>
              )}
            </div>

            {/* المعلومات */}
            <div className="divide-y divide-navy/5 rounded-2xl bg-white px-3 text-sm shadow-soft">
              <Row l="آخر ظهور بالتطبيق" v={ago(c.lastSeen)} />
              <Row
                l="آخر موقع"
                v={
                  c.location ? (
                    <a
                      href={`https://maps.google.com/?q=${c.location.lat},${c.location.lng}`}
                      className="inline-flex items-center gap-1 font-bold text-brand"
                    >
                      <MapPin size={13} /> {ago(c.location.at)}
                    </a>
                  ) : c.locationAt ? (
                    `قديم (${ago(c.locationAt)})`
                  ) : (
                    "ما في"
                  )
                }
              />
              <Row
                l="آخر طلب استلمه"
                v={c.lastAssigned ? ago(c.lastAssigned) : "—"}
              />
              {c.wallet.enabled && (
                <Row
                  l="الرصيد"
                  v={`${fmt(c.wallet.balance)}${c.wallet.ordersLeft != null ? ` (بيكفي ${c.wallet.ordersLeft} طلب)` : ""}`}
                />
              )}
              <Row l="وسيلة النقل" v={c.vehicle || "—"} />
              <Row l="الرقم الوطني" v={c.nationalId || "—"} />
              <Row l="عنوان السكن" v={c.homeAddress || "—"} />
              <Row l="انضاف بتاريخ" v={date(c.createdAt)} />
              <Row
                l="أول توصيلة"
                v={c.firstDelivery ? date(c.firstDelivery) : "—"}
              />
              {c.notes && <Row l="ملاحظات" v={c.notes} />}
            </div>

            {/* إعدادات الموبايل */}
            <div className="rounded-2xl bg-white p-3 shadow-soft">
              <p className="text-sm font-extrabold">جاهزية الموبايل</p>
              {c.device ? (
                <>
                  <ul className="mt-2 grid grid-cols-2 gap-1.5 text-xs font-bold">
                    {[
                      ["notifications", "الإشعارات"],
                      ["location", "إذن الموقع"],
                      ["gps", "الـGPS"],
                      ["battery", "الشغل بالخلفية"],
                      ["autostart", "التشغيل التلقائي"],
                      ["fullScreen", "شاشة القفل"],
                    ]
                      .filter(([k]) => c.device[k] != null)
                      .map(([k, l]) => (
                        <li
                          key={k}
                          className={`rounded-lg px-2 py-1.5 ${c.device[k] ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                        >
                          {c.device[k] ? "✓" : "✗"} {l}
                        </li>
                      ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-navy/45">
                    {[
                      c.device.brand,
                      c.device.android ? `أندرويد API ${c.device.android}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · آخر فحص {ago(c.device.at)}
                  </p>
                  {c.device.gps == null && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800">
                      معه نسخة قديمة من التطبيق، فما منقدر نعرف إذا الـGPS مفتوح. خليه ينزّل آخر نسخة.
                    </p>
                  )}
                  {!c.location && (
                    <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700">
                      موبايله ما عم يبعت موقع. خليه يتأكد إنو الموقع (GPS) مفتوح بالموبايل، وينزّل آخر نسخة ويفتح التطبيق.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-navy/50">
                  ما منعرف لهلق. بتبين لما يفتح النسخة الجديدة من تطبيق عامل
                  التوصيل.
                </p>
              )}
            </div>

            {/* الوثائق */}
            <div className="rounded-2xl bg-white p-3 shadow-soft">
              <p className="mb-2 text-sm font-extrabold">الوثائق</p>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-bold">
                {[
                  ["front", "الهوية (وجه)"],
                  ["back", "الهوية (ظهر)"],
                  ["license", "الشهادة"],
                ].map(([k, l]) =>
                  c.docs[k] ? (
                    <button
                      key={k}
                      onClick={() => openDoc(k, l)}
                      className="flex flex-col items-center gap-1 rounded-xl bg-brand/10 py-3 text-brand"
                    >
                      <FileText size={18} /> {l}
                    </button>
                  ) : (
                    <span
                      key={k}
                      className="flex flex-col items-center gap-1 rounded-xl bg-navy-50 py-3 text-navy/40"
                    >
                      <FileText size={18} /> {l}
                      <span className="text-[10px] font-normal">ما انضافت</span>
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* السجل */}
            <div
              className="flex gap-1 rounded-2xl bg-white p-1 text-sm font-bold shadow-soft"
              role="tablist"
            >
              {[
                ["orders", `طلباته (${data.orders.length})`],
                ["offers", `العروض (${data.offers.length})`],
              ].map(([k, l]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`flex-1 rounded-xl py-2 ${tab === k ? "bg-navy text-white" : "text-navy/60"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {tab === "orders" && (
              <ul className="space-y-2">
                {data.orders.length === 0 && (
                  <li className="rounded-2xl bg-white p-4 text-center text-sm text-navy/50">
                    ما اشتغل ولا طلب لهلق
                  </li>
                )}
                {data.orders.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-2xl bg-white p-3 text-xs shadow-soft"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold">
                        <span className="font-en">{o.number}</span> ·{" "}
                        {CATEGORY[o.category] || "طلب"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(ORDER_STATUS[o.status] || ORDER_STATUS.new)[1]}`}
                      >
                        {(ORDER_STATUS[o.status] || ORDER_STATUS.new)[0]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-navy/70">
                      {o.what}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-navy/50">
                      <span>{when(o.createdAt)}</span>
                      <span>أجرة {fmt(o.fee)}</span>
                      {o.minutes != null && (
                        <span>وصّله بـ {o.minutes} دقيقة</span>
                      )}
                    </div>
                    {o.rating && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">
                        {"★".repeat(o.rating.stars)}
                        {"☆".repeat(5 - o.rating.stars)}
                        {o.rating.note ? ` · ${o.rating.note}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {tab === "offers" && (
              <ul className="divide-y divide-navy/5 rounded-2xl bg-white px-3 text-xs shadow-soft">
                {data.offers.length === 0 && (
                  <li className="py-4 text-center text-sm text-navy/50">
                    ما وصله ولا عرض لهلق
                  </li>
                )}
                {data.offers.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        <span className="font-en">{f.number}</span> ·{" "}
                        {CATEGORY[f.category] || "طلب"} · أجرة {fmt(f.fee)}
                      </span>
                      <span className="text-navy/50">
                        {when(f.at)}
                        {f.seconds != null && f.status !== "expired"
                          ? ` · ردّ بعد ${f.seconds} ثانية`
                          : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${(OFFER_STATUS[f.status] || OFFER_STATUS.cancelled)[1]}`}
                    >
                      {(OFFER_STATUS[f.status] || OFFER_STATUS.cancelled)[0]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {doc && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-navy/95"
          onClick={(e) => (e.stopPropagation(), setDoc(null))}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <span className="font-bold">{doc.label}</span>
            <button
              aria-label="إغلاق"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            {doc.url ? (
              <img
                src={doc.url}
                alt={doc.label}
                className="max-h-full max-w-full rounded-xl"
              />
            ) : doc.error ? (
              <p className="text-white">ما قدرنا نفتح الوثيقة</p>
            ) : (
              <LoaderCircle className="animate-spin text-white" />
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Stat({ label, value, sub, strong }) {
  return (
    <div
      className={`rounded-2xl p-3 shadow-soft ${strong ? "bg-brand text-white" : "bg-white"}`}
    >
      <p
        className={`text-[11px] font-bold ${strong ? "text-white/75" : "text-navy/50"}`}
      >
        {label}
      </p>
      <p className="font-en text-2xl font-black leading-tight">{value}</p>
      <p className={`text-[10px] ${strong ? "text-white/70" : "text-navy/45"}`}>
        {sub}
      </p>
    </div>
  );
}
const Mini = ({ n, l, c = "" }) => (
  <div className="rounded-xl bg-navy-50 py-2">
    <p className={`font-en text-lg font-black ${c}`}>{n}</p>
    <p className="text-navy/55">{l}</p>
  </div>
);
const Row = ({ l, v }) => (
  <div className="flex items-start justify-between gap-3 py-2.5">
    <span className="shrink-0 text-navy/50">{l}</span>
    <span className="text-end font-bold">{v}</span>
  </div>
);
