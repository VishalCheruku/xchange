import { Route, Routes } from 'react-router-dom'
import Home from './Components/Pages/Home'
import Details from './Components/Details/Details'
import Category from './Components/Pages/Category'
import Profile from './Components/Pages/Profile'
import Search from './Components/Pages/Search'
import AdminPanel from './Components/Pages/AdminPanel'
import Chat from './Components/Pages/Chat'

const App = () => {
  return (
   <>
     <Routes>
      <Route  path='/' element={<Home/>}/>
      <Route  path='/details/:id' element={<Details/>}/>
      <Route  path='/details' element={<Details/>}/>
      <Route  path='/category/:name' element={<Category/>}/>
      <Route  path='/profile' element={<Profile/>}/>
      <Route  path='/search' element={<Search/>}/>
      <Route  path='/admin' element={<AdminPanel/>}/>
      <Route  path='/chat' element={<Chat/>}/>
     </Routes>
   </>
  )
}

export default App
