import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../Navbar/Navbar'
import Card from '../Card/Card'
import { ItemsContext } from '../Context/Item'
import Login from '../Modal/Login'
import Sell from '../Modal/Sell'
import { auth } from '../Firebase/Firebase'
import { useAuthState } from 'react-firebase-hooks/auth'

const Category = () => {
  const { name } = useParams()
  const categoryName = decodeURIComponent(name || '')
  const itemsCtx = ItemsContext()
  const [openModal, setModal] = useState(false)
  const [openModalSell, setModalSell] = useState(false)
  const [user] = useAuthState(auth)

  const toggleModal = () => setModal((prev) => !prev)
  const toggleModalSell = () => setModalSell((prev) => !prev)

  const contentMap = {
    Cars: {
      headline: 'Drive-ready deals',
      blurb: 'Certified sellers, transparent history, and listings tuned for your next ride.',
      chips: ['Sedan', 'SUV', 'Hatchback', 'EV', 'Budget picks'],
      tips: ['Ask for service records and VIN checks.', 'Meet in daylight for a test drive.', 'Confirm insurance transfer steps.'],
      gradient: 'from-sky-100 to-white',
    },
    Bikes: {
      headline: 'Two-wheel finds',
      blurb: 'From mountain rigs to city commuters, pick the perfect bike with trusted specs.',
      chips: ['MTB', 'Hybrid', 'Road', 'Fixie', 'Gear sets'],
      tips: ['Inspect drivetrain wear.', 'Check brake response and rotor condition.', 'Confirm frame size fits your height.'],
      gradient: 'from-cyan-100 to-white',
    },
    Houses: {
      headline: 'Homes & rentals',
      blurb: 'Apartments, villas, and cozy corners with clear details and locality insights.',
      chips: ['2 BHK', 'Studio', 'Villa', 'Co-living', 'Near metro'],
      tips: ['Verify property papers and IDs.', 'Visit the neighborhood twice—day and night.', 'Agree on deposit and maintenance in writing.'],
      gradient: 'from-blue-100 to-white',
    },
    Books: {
      headline: 'Stories & study',
      blurb: 'Curated textbooks, novels, and rare finds—priced to keep you reading.',
      chips: ['Textbooks', 'Fiction', 'Non-fiction', 'Exam prep', 'Comics'],
      tips: ['Check edition and author.', 'Look for notes or highlights.', 'Bundle titles for better pricing.'],
      gradient: 'from-indigo-100 to-white',
    },
    Sports: {
      headline: 'Gear up and play',
      blurb: 'Cricket to climbing—quality gear that’s game-ready and budget-smart.',
      chips: ['Cricket', 'Football', 'Badminton', 'Gym', 'Outdoor'],
      tips: ['Inspect seams and grips.', 'Check expiry on safety gear.', 'Test weight and balance in person.'],
      gradient: 'from-emerald-100 to-white',
    },
    Furniture: {
      headline: 'Move-in comfort',
      blurb: 'Sofas, desks, and décor to refresh any room with sustainable picks.',
      chips: ['Sofas', 'Ergo chairs', 'Tables', 'Shelves', 'Décor'],
      tips: ['Check joints and wobble.', 'Measure doorways before pickup.', 'Ask about pets/smoke history.'],
      gradient: 'from-amber-50 to-white',
    },
    Electronics: {
      headline: 'Smart tech lineup',
      blurb: 'Phones, laptops, and audio with honest condition notes and clear pricing.',
      chips: ['Laptops', 'Mobiles', 'Audio', 'Monitors', 'Smart home'],
      tips: ['Run a quick battery test.', 'Check for screen bleed or dead pixels.', 'Verify IMEI/serial before paying.'],
      gradient: 'from-slate-100 to-white',
    },
  }

  const categoryContent = contentMap[categoryName] || {
    headline: `${categoryName} highlights`,
    blurb: `Fresh picks tailored to ${categoryName}. Browse confidently with trusted sellers.`,
    chips: ['Popular', 'Verified', 'Budget', 'Nearby'],
    tips: ['Meet in public places.', 'Inspect before paying.', 'Use secure payments.'],
    gradient: 'from-slate-100 to-white',
  }

  const items = useMemo(() => {
    const all = itemsCtx.items || []
    return all.filter((item) => item.category === categoryName)
  }, [itemsCtx.items, categoryName])

  return (
    <div>
      <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />
      <Login toggleModal={toggleModal} status={openModal} />
      <Sell setItems={(itemsCtx).setItems} toggleModalSell={toggleModalSell} status={openModalSell} />
      <section className="pt-32 pb-8 px-5 sm:px-12 md:px-20 lg:px-32">
        <div className={`xchange-hero bg-gradient-to-br ${categoryContent.gradient}`}>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Category</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight text-slate-900">
            {categoryName}
          </h1>
          <p className="mt-3 text-slate-600 max-w-2xl">
            {categoryContent.blurb}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {categoryContent.chips.map((chip) => (
              <span key={chip} className="chip">{chip}</span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/" className="xchange-btn ghost">
              Back to home
            </Link>
            <a href="#category-listings" className="xchange-btn">
              Explore listings
            </a>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {categoryContent.tips.map((tip) => (
              <div key={tip} className="stat-card">
                <p className="stat-title">Tip</p>
                <p className="text-sm text-slate-700">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div id="category-listings">
        <Card
          items={items}
          title={`${categoryName} picks`}
          subtitle={`Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}
          emptyMessage={`No listings found in ${categoryName} yet.`}
          canDelete={(item) => user && item.userId === user.uid}
          onDelete={async (item) => {
            try {
              await itemsCtx.deleteItem(item.id)
            } catch (err) {
              console.error(err)
              alert('Failed to delete. Please try again.')
            }
          }}
        />
      </div>
    </div>
  )
}

export default Category
