import { useState } from 'react'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import HeroOrderCard from './components/HeroOrderCard'
import PromoCarousel from './components/PromoCarousel'
import ServicesGrid from './components/ServicesGrid'
import BottomNav from './components/BottomNav'
import ActiveOrderWidget from './components/ActiveOrderWidget'
import GasOrderSheet from './components/GasOrderSheet'
import CustomOrderSheet from './components/CustomOrderSheet'
import LoginScreen from './screens/LoginScreen'
import OrdersScreen from './screens/OrdersScreen'
import AccountScreen from './screens/AccountScreen'
import { useAuth } from './auth/AuthProvider'

export default function App() {
  const { user } = useAuth()
  const [gasOpen, setGasOpen] = useState(false)
  const [custom, setCustom] = useState(null) // { category, text } أو null
  const [activeOrder, setActiveOrder] = useState(false)
  const [tab, setTab] = useState('home')

  // الزبون لازم يسجّل دخول أولاً
  if (!user) return <LoginScreen />

  // الغاز له شاشة خاصة، وباقي الخدمات تفتح "اطلب أي شي" مع نوع المحل مختار مسبقاً
  // (لاحقاً عند التعاقد مع مطاعم: "مطاعم" تفتح قائمة المطاعم الشريكة)
  const openService = (id) => {
    if (id === 'gas') setGasOpen(true)
    else setCustom({ category: id, text: '' })
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
            <Header />
            <div className="relative z-10 -mt-6 space-y-6 px-4">
              <SearchBar onSubmit={(text) => setCustom({ category: 'any', text })} />
              <HeroOrderCard onClick={startOrder} />
              <ServicesGrid onSelect={openService} />
              <PromoCarousel />
            </div>
          </>
        )}
        {tab === 'orders' && <OrdersScreen onStart={startOrder} />}
        {tab === 'account' && <AccountScreen />}
      </main>

      {activeOrder && <ActiveOrderWidget onClose={() => setActiveOrder(false)} />}
      <BottomNav active={tab} onChange={setTab} />

      <GasOrderSheet open={gasOpen} onClose={() => setGasOpen(false)} onConfirmed={() => setActiveOrder(true)} />
      <CustomOrderSheet
        open={!!custom}
        initialCategory={custom?.category}
        initialText={custom?.text}
        onClose={() => setCustom(null)}
        onConfirmed={() => setActiveOrder(true)}
      />
    </div>
  )
}
