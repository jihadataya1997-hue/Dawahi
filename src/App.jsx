import { useState } from 'react'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import PromoCarousel from './components/PromoCarousel'
import ServicesGrid from './components/ServicesGrid'
import BottomNav from './components/BottomNav'
import ActiveOrderWidget from './components/ActiveOrderWidget'
import GasOrderSheet from './components/GasOrderSheet'

export default function App() {
  const [gasOpen, setGasOpen] = useState(false)
  const [activeOrder, setActiveOrder] = useState(true)
  const [tab, setTab] = useState('home')

  const openService = (id) => {
    if (id === 'gas') setGasOpen(true)
  }

  return (
    // إطار الموبايل: على الكمبيوتر يظهر بعرض هاتف في المنتصف
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#F5F7FA] sm:shadow-2xl">
      <main className="scrollbar-hide flex-1 overflow-y-auto pb-44">
        <Header />
        <div className="relative z-10 -mt-6 space-y-6 px-4">
          <SearchBar />
          <PromoCarousel />
          <ServicesGrid onSelect={openService} />
        </div>
      </main>

      {activeOrder && <ActiveOrderWidget onClose={() => setActiveOrder(false)} />}
      <BottomNav active={tab} onChange={setTab} />

      <GasOrderSheet
        open={gasOpen}
        onClose={() => setGasOpen(false)}
        onConfirmed={() => setActiveOrder(true)}
      />
    </div>
  )
}
