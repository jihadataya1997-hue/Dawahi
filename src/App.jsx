import { useState } from 'react'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import HeroOrderCard from './components/HeroOrderCard'
import BannerCarousel from './components/BannerCarousel'
import InboxSheet, { useInbox } from './components/InboxSheet'
import ServicesGrid from './components/ServicesGrid'
import BottomNav from './components/BottomNav'
import ActiveOrderWidget from './components/ActiveOrderWidget'
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
      <main className="scrollbar-hide flex-1 overflow-y-auto pb-44">
        {tab === 'home' && (
          <>
            <Header unread={inbox.unread} onBell={() => setInboxOpen(true)} />
            <div className="relative z-10 -mt-6 space-y-6 px-4">
              <SearchBar onSubmit={(text) => setCustom({ category: 'any', text })} />
              <BannerCarousel onAction={onBanner} />
              <HeroOrderCard onClick={startOrder} />
              <ServicesGrid onSelect={openService} />
            </div>
          </>
        )}
        {tab === 'orders' && <OrdersScreen onStart={startOrder} />}
        {tab === 'account' && <AccountScreen />}
      </main>

      {activeOrder && tab !== 'orders' && <ActiveOrderWidget order={activeOrder} onOpen={() => setTab('orders')} />}
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
