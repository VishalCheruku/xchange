import { Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import LoaderX from './Components/Loader/LoaderX'
import AIModeIndicator from './Components/AI/AIModeIndicator'

const Home = lazy(() => import('./Components/Pages/Home'))
const Details = lazy(() => import('./Components/Details/Details'))
const Category = lazy(() => import('./Components/Pages/Category'))
const Profile = lazy(() => import('./Components/Pages/Profile'))
const MyListings = lazy(() => import('./Components/Pages/MyListings'))
const Search = lazy(() => import('./Components/Pages/Search'))
const AdminPanel = lazy(() => import('./Components/Pages/AdminPanel'))
const Chat = lazy(() => import('./Components/Pages/Chat'))

const App = () => {
  return (
   <>
     <AIModeIndicator />
     <Suspense fallback={<LoaderX />}>
       <Routes>
        <Route  path='/' element={<Home/>}/>
        <Route  path='/details/:id' element={<Details/>}/>
        <Route  path='/details' element={<Details/>}/>
        <Route  path='/category/:name' element={<Category/>}/>
        <Route  path='/profile' element={<Profile/>}/>
        <Route  path='/my-listings' element={<MyListings/>}/>
        <Route  path='/search' element={<Search/>}/>
        <Route  path='/admin' element={<AdminPanel/>}/>
        <Route  path='/chat' element={<Chat/>}/>
       </Routes>
     </Suspense>
   </>
  )
}

export default App
