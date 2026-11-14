import { useCallback, useState } from 'react'
import InboxSheet, { useInbox } from './components/InboxSheet'
import BottomNav from './components/BottomNav'
import HomeScreen from './screens/HomeScreen'
import GasOrderSheet from './components/GasOrderSheet'
import CustomOrderSheet from './components/CustomOrderSheet'
import LoginScreen from './screens/LoginScreen'
import OrdersScreen from './screens/OrdersScreen'
import AccountScreen from './screens/AccountScreen'
import { useAuth } from './auth/AuthProvider'
import { useOrders } from './orders/OrdersProvider'
import { useAppConfig } from './config/AppConfigProvider'
import { MaintenanceScreen, PromoPopup, Toast } from './components/AppControls'
import { useLang } from './i18n/LanguageProvider'

export default function App() {
  const { user } = useAuth()
  const { activeOrder } = useOrders()
  const [gasOpen, setGasOpen] = useState(false)
  const [custom, setCustom] = useState(null) // { category, text } أو null
  const [tab, setTab] = useState('home')
  const [inboxOpen, setInboxOpen] = useState(() => new URLSearchParams(location.search).has('inbox'))

  const { maintenance } = useAppConfig()
  // وضع الصيانة من لوحة الإدارة بيغطي كل شي
  if (maintenance) return <MaintenanceScreen />
  // الزبون لازم يسجّل دخول أولاً
  if (!user) return <LoginScreen />
  return <Main {...{ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }} />
}

function Main({ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }) {
  const inbox = useInbox()
  const { services } = useAppConfig()
  const { lang } = useLang()
  const [toast, setToast] = useState('')
  const clearToast = useCallback(() => setToast(''), [])
  // خدمة موقّفة مؤقتاً من الإدارة؟ منبيّن السبب بدل ما نفتح الطلب
  const pausedNote = (id) => {
    const s = services.find((x) => x.id === id)
    if (!s?.paused) return null
    return s.pauseNote || (lang === 'ar' ? 'هذه الخدمة متوقفة مؤقتاً' : 'This service is paused for now')
  }

  // الغاز له شاشة خاصة، وباقي الخدمات تفتح "اطلب أي شي" مع نوع المحل مختار مسبقاً
  // (لاحقاً عند التعاقد مع مطاعم: "مطاعم" تفتح قائمة المطاعم الشريكة)
  const openService = (id) => {
    const note = pausedNote(id)
    if (note) return setToast(note)
    if (id === 'gas') setGasOpen(true)
    else setCustom({ category: id, text: '' })
  }
  // الضغط على إعلان
  const onBanner = (b) => {
    const note = pausedNote(b.action === 'gas' ? 'gas' : b.action === 'order' ? b.actionValue : null)
    if (note) return setToast(note)
    if (b.action === 'gas') setGasOpen(true)
    else if (b.action === 'order') setCustom({ category: b.actionValue || 'any', text: '' })
    else if (b.action === 'url' && b.actionValue) window.open(b.actionValue, '_blank', 'noopener')
  }
  const startOrder = () => {
    setTab('home')
    setCustom({ category: 'any', text: '' })
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#F5F7FA] sm:shadow-2xl">
      <main className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === 'home' && (
          <HomeScreen
            activeOrder={activeOrder}
            unread={inbox.unread}
            onBell={() => setInboxOpen(true)}
            onOrder={startOrder}
            onService={openService}
            onBanner={onBanner}
            onOpenOrders={() => setTab('orders')}
          />
        )}
        {tab === 'orders' && <OrdersScreen onStart={startOrder} />}
        {tab === 'account' && <AccountScreen />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      <PromoPopup onAction={onBanner} />
      <Toast text={toast} onDone={clearToast} />

      <GasOrderSheet open={gasOpen} onClose={() => setGasOpen(false)} />
      <InboxSheet open={inboxOpen} items={inbox.items} onClose={() => setInboxOpen(false)} />
      <CustomOrderSheet
        open={!!custom}
        initialCategory={custom?.category}
        initialText={custom?.text}
        onClose={() => setCustom(null)}
      />
    </div>
  )
}
