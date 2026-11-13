import { useState } from 'react'
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

export default function App() {
  const { user } = useAuth()
  const { activeOrder } = useOrders()
  const [gasOpen, setGasOpen] = useState(false)
  const [custom, setCustom] = useState(null) // { category, text } أو null
  const [tab, setTab] = useState('home')
  const [inboxOpen, setInboxOpen] = useState(() => new URLSearchParams(location.search).has('inbox'))

  // الزبون لازم يسجّل دخول أولاً
  if (!user) return <LoginScreen />
  return <Main {...{ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }} />
}

function Main({ tab, setTab, gasOpen, setGasOpen, custom, setCustom, activeOrder, inboxOpen, setInboxOpen }) {
  const inbox = useInbox()

  // الغاز له شاشة خاصة، وباقي الخدمات تفتح "اطلب أي شي" مع نوع المحل مختار مسبقاً
  // (لاحقاً عند التعاقد مع مطاعم: "مطاعم" تفتح قائمة المطاعم الشريكة)
  const openService = (id) => {
    if (id === 'gas') setGasOpen(true)
    else setCustom({ category: id, text: '' })
  }
  // الضغط على إعلان
  const onBanner = (b) => {
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
      <main className="scrollbar-hide flex-1 overflow-y-auto pb-28">
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
