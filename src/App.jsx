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

export default function App() {
  const [gasOpen, setGasOpen] = useState(false)
  // طلب حر: { category, text } أو null
  const [custom, setCustom] = useState(null)
  const [activeOrder, setActiveOrder] = useState(true)
  const [tab, setTab] = useState('home')

  // الغاز له شاشة خاصة، وباقي الخدمات تفتح "اطلب أي شي" مع اختيار نوع المحل مسبقاً
  // (لاحقاً عند التعاقد مع مطاعم: "مطاعم" تفتح قائمة المطاعم الشريكة بدل ذلك)
  const openService = (id) => {
    if (id === 'gas') setGasOpen(true)
    else setCustom({ category: id, text: '' })
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#F5F7FA] sm:shadow-2xl">
      <main className="scrollbar-hide flex-1 overflow-y-auto pb-44">
        <Header />
        <div className="relative z-10 -mt-6 space-y-6 px-4">
          <SearchBar onSubmit={(text) => setCustom({ category: 'any', text })} />
          <HeroOrderCard onClick={() => setCustom({ category: 'any', text: '' })} />
          <ServicesGrid onSelect={openService} />
          <PromoCarousel />
        </div>
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
