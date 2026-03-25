import { Modal, ModalBody, Carousel } from "flowbite-react"
import google from '../../assets/google.png'
import mobile from '../../assets/mobile.svg'
import guitar from '../../assets/guita.png'
import love from '../../assets/love.png'
import avatar from '../../assets/avatar.png'
import close from '../../assets/close.svg'
import { signInWithPopup } from "firebase/auth"
import { auth, provider } from "../Firebase/Firebase"




const Login = ({toggleModal, status}) => {
   const handleClick = async()=>{
    try {

     const result =   await signInWithPopup(auth,provider);
        toggleModal();
        console.log('User' , result.user);
    } catch (error) {
        console.log(error);
        
        
    }
   }
  return (
    <div>
            <Modal theme={{
                "root": {
                    "base": "fixed inset-x-0 top-0 z-[1200] h-[100dvh] overflow-y-auto overflow-x-hidden md:inset-0"
                },
                "content": {
                    "base": "relative w-full p-2 sm:p-4 md:h-auto",
                    "inner": "relative flex max-h-[calc(100dvh-2rem)] flex-col rounded-2xl bg-white shadow-lg dark:bg-gray-700 overflow-hidden"
                },
            }} onClick={toggleModal} className="xchange-modal-layer !z-[1200] bg-black/60 backdrop-blur-sm rounded-none" position={'center'} show={status} size="md" popup={true}>
                <div onClick={(event)=> event.stopPropagation()}   className="p-6 pb-3 pl-3 pr-3 bg-gradient-to-br from-sky-50 via-white to-white relative">
                    <img onClick={toggleModal} className="w-6 absolute z-20 top-4 right-4 cursor-pointer hover:scale-105 transition" src={close} alt="" />
                    <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.12),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_40%)]" />
                    <Carousel slide={false} theme={{
                        "indicators": {
                            "active": {
                                "off": "bg-gray-300",
                                "on": "bg-teal-300"
                            },
                            "base": "h-2 w-2 rounded-full",
                            "wrapper": "absolute bottom-2 left-1/2 flex -translate-x-1/2 space-x-3"
                        },
                        "scrollContainer": {
                            "base": "flex h-full snap-mandatory overflow-y-hidden overflow-x-scroll scroll-smooth",
                            "snap": "snap-x"
                        }, "control": {
                            "base": "inline-flex items-center justify-center bg-transparent",
                            "icon": "w-8 text-black dark:text-black"
                        },
                    }}  onClick={(event)=>{event.stopPropagation()}}   className="w-full h-56 pb-5 rounded-none relative z-10">
                        <div className="flex flex-col items-center justify-center">
                            <img className="w-24 pb-5" src={guitar} alt="Car Image 1" />
                            <p style={{ color: '#0b1113' }} className=" w-60 sm:w-72 text-center pb-5 font-semibold">Help us make Xchange the safest place to swap and sell.</p>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <img className="w-24 pb-5" src={love} alt="Car Image 2" />
                            <p style={{ color: '#0b1113' }} className=" w-60 sm:w-72 text-center pb-5 font-semibold">Close deals from the comfort of your home.</p>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <img className="w-24 pb-5" src={avatar} alt="Car Image 3" />
                            <p style={{ color: '#0b1113' }} className=" w-60 sm:w-72 text-center pb-5 font-semibold">Keep all your favorites in one place.</p>
                        </div>
                    </Carousel>
                </div>

                <ModalBody className="bg-white h-96 max-h-[calc(100dvh-2rem)] p-0 rounded-none overflow-y-auto" onClick={(event)=> {event.stopPropagation()}} >

                    <div className="p-6 pt-0 space-y-4">
                        <button className="flex items-center justify-start gap-3 rounded-xl border border-slate-200 bg-white p-4 relative hover:border-sky-300 hover:shadow-md transition">
                            <img className="w-6" src={mobile} alt="" />
                            <div className="text-left">
                              <p className="text-sm font-semibold text-slate-900">Continue with phone</p>
                              <p className="text-xs text-slate-500">Coming soon</p>
                            </div>
                        </button>
                        <button  className="flex items-center justify-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 relative cursor-pointer hover:border-sky-400 hover:shadow-lg active:translate-y-[1px] transition"   onClick={handleClick} >
                            <img className="w-7" src={google} alt="" />
                            <p className="text-sm text-slate-800 font-semibold" >Continue with Google</p>
                        </button>
                        <div className="pt-2 flex flex-col items-center justify-center gap-2">
                            <p className="font-semibold text-sm text-slate-700">OR</p>
                            <button className="text-sm font-bold text-sky-700 underline underline-offset-4 hover:text-sky-900 transition" onClick={handleClick}>
                              Login with Email
                            </button>
                            <p className="text-[11px] text-slate-500">(Uses secure Google sign-in)</p>
                        </div>
                        <div className="pt-4 sm:pt-8 flex flex-col items-center justify-center text-center space-y-2">
                            <p className="text-xs text-slate-600">All your personal details are safe with us.</p>
                            <p className="text-xs text-slate-600">If you continue, you accept <span className="text-sky-700 font-semibold">Xchange Terms</span> and <span className="text-sky-700 font-semibold">Privacy Policy</span>.</p>
                        </div>
                    </div>

                </ModalBody>
            </Modal>
        </div>
  )
}

export default Login
