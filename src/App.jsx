import { useCallback, useState } from 'react'
import InboxSheet, { useInbox } from './components/InboxSheet'
import BottomNav from './components/BottomNav'
import FloatingOrder from './components/FloatingOrder'
import HomeScreen from './screens/HomeScreen'
import GasOrderSheet from './components/GasOrderSheet'
import CustomOrderSheet from './components/CustomOrderSheet'
import LoginScreen from './screens/LoginScreen'
import SetPasswordScreen from './screens/SetPasswordScreen'
import PermissionsScreen, { permsDone } from './screens/PermissionsScreen'
import UpdateNotice from './components/UpdateNotice'
import { RestaurantsRow, StoreSheet, useStores } from './stores/Restaurants'
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
  const [needPerms, setNeedPerms] = useState(() => !permsDone())

  const { maintenance } = useAppConfig()
  // وضع الصيانة من لوحة الإدارة بيغطي كل شي
  if (maintenance) return <MaintenanceScreen />
  // الزبون لازم يسجّل دخول أولاً
  if (!user) return <LoginScreen />
  if (user.mustSetPassword) return <SetPasswordScreen />
  if (needPerms) return <PermissionsScreen onDone={() => setNeedPerms(false)} />
  return <Main {...{ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }} />
}

function Main({ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }) {
  const inbox = useInbox()
  const { services } = useAppConfig()
  const { lang } = useLang()
  const [toast, setToast] = useState('')
  const stores = useStores()
  const [storeOpen, setStoreOpen] = useState(null)
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
    // الغاز والمازوت طلب توصيل متل أي طلب (منجيبه من المحل وبتدفع سعره عند الاستلام)
    const preset = { gas: 'تبديل جرة غاز: جرة وحدة', diesel: 'تعبئة مازوت: ___ ليتر' }
    setCustom({ category: id, text: preset[id] || '' })
  }
  const checkout = (cart) => {
    setStoreOpen(null)
    setCustom({ category: 'restaurants', text: '', cart })
  }
  // الضغط على إعلان
  const onBanner = (b) => {
    const note = pausedNote(b.action === 'gas' ? 'gas' : b.action === 'order' ? b.actionValue : null)
    if (note) return setToast(note)
    if (b.action === 'gas') setCustom({ category: 'gas', text: 'تبديل جرة غاز: جرة وحدة' })
    else if (b.action === 'order') setCustom({ category: b.actionValue || 'any', text: '' })
    else if (b.action === 'url' && b.actionValue) window.open(b.actionValue, '_blank', 'noopener')
  }
  const startOrder = () => {
    setTab('home')
    setCustom({ category: 'any', text: '' })
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#F5F7FA] sm:shadow-2xl">
      <main className={`scrollbar-hide min-h-0 flex-1 overflow-y-auto ${activeOrder && tab !== 'orders' ? 'pb-32' : 'pb-4'}`}>
        {tab === 'home' && (
          <HomeScreen
            activeOrder={activeOrder}
            unread={inbox.unread}
            onBell={() => setInboxOpen(true)}
            onOrder={startOrder}
            onService={openService}
            onBanner={onBanner}
            onOpenOrders={() => setTab('orders')}
            restaurants={<RestaurantsRow stores={stores} onOpen={setStoreOpen} />}
            onReorder={(o) => setCustom({ category: o.category || 'any', text: o.details.items, store: o.details.storeName || '' })}
          />
        )}
        {tab === 'orders' && <OrdersScreen onStart={startOrder} />}
        {tab === 'account' && <AccountScreen />}
      </main>

      <div className="relative shrink-0">
        {tab !== 'orders' && <FloatingOrder order={activeOrder} onOpen={() => setTab('orders')} />}
        <BottomNav active={tab} onChange={setTab} />
      </div>

      <PromoPopup onAction={onBanner} />
      <UpdateNotice />
      <Toast text={toast} onDone={clearToast} />

      <GasOrderSheet open={gasOpen} onClose={() => setGasOpen(false)} />
      <StoreSheet store={storeOpen} onClose={() => setStoreOpen(null)} onCheckout={checkout} />
      <InboxSheet open={inboxOpen} items={inbox.items} onClose={() => setInboxOpen(false)} />
      <CustomOrderSheet
        open={!!custom}
        initialCategory={custom?.category}
        initialText={custom?.text}
        cart={custom?.cart}
        initialStore={custom?.store}
        onClose={() => setCustom(null)}
      />
    </div>
  )
}
