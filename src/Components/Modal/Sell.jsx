import { Modal, ModalBody } from "flowbite-react"
import { useState } from "react"
import Input from "../Input/Input"
import { UserAuth } from "../Context/Auth"
import { addDoc, collection } from "firebase/firestore"
import { fetchFromFirestore, fireStore } from "../Firebase/Firebase"
import fileUpload from '../../assets/fileUpload.svg'
import loading from '../../assets/loading.gif'
import close from '../../assets/close.svg'



const Sell = (props) => {  
    const {toggleModalSell,status ,setItems} = props

    const [title,setTitle] = useState('')
    const [category,setCategory] = useState('')
    const [price,setPrice] = useState('')
    const [description,setDescription] = useState('')
    const [image,setImage] = useState(null)

    const [submitting,setSubmitting] = useState(false)

    const auth = UserAuth();

    const MAX_FILE_MB = 8
    const MAX_DIMENSION = 1600
    const JPEG_QUALITY = 0.78

    const handleImageUpload = (event)=>{
        const file = event.target.files?.[0]
        if(!file) return
        if(!file.type.startsWith('image/')){
            alert('Please upload a valid image file')
            return
        }
        const sizeMb = file.size / (1024 * 1024)
        if(sizeMb > MAX_FILE_MB){
            alert(`Image is too large. Please choose a file under ${MAX_FILE_MB}MB.`)
            return
        }
        setImage(file)
    }
    
    const handleSubmit = async (event)=>{
        event.preventDefault();

        if(!auth?.user){
            alert('Please login to continue');
            return;
        }

        setSubmitting(true)

        const readImageAsDataUrl =(file) =>{
            return new Promise((resolve,reject) =>{
                const reader = new FileReader();
                reader.onloadend = ()=>{
                    const imageUrl = reader.result
                    resolve(imageUrl)
                }
                reader.onerror = reject
                reader.readAsDataURL(file)
            })
        }

        const resizeImage = (file) => {
            return new Promise((resolve, reject) => {
                const img = new Image()
                const reader = new FileReader()

                reader.onload = () => {
                    img.src = reader.result
                }
                reader.onerror = reject

                img.onload = () => {
                    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
                    const targetW = Math.round(img.width * scale)
                    const targetH = Math.round(img.height * scale)

                    const canvas = document.createElement('canvas')
                    canvas.width = targetW
                    canvas.height = targetH
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        reject(new Error('Canvas not supported'))
                        return
                    }
                    ctx.drawImage(img, 0, 0, targetW, targetH)

                    canvas.toBlob(
                        (blob) => {
                            if(!blob){
                                reject(new Error('Image compression failed'))
                                return
                            }
                            resolve(blob)
                        },
                        'image/jpeg',
                        JPEG_QUALITY
                    )
                }
                img.onerror = reject

                reader.readAsDataURL(file)
            })
        }

        let imageUrl = '';
        if(image){
            try {
                if (image.type === 'image/svg+xml') {
                    imageUrl = await readImageAsDataUrl(image)
                } else if (image.size <= 150 * 1024) {
                    imageUrl = await readImageAsDataUrl(image)
                } else {
                    const optimizedBlob = await resizeImage(image)
                    imageUrl = await readImageAsDataUrl(optimizedBlob)
                }
            } catch (error) {
                console.log(error)
                alert('Failed to process image');
                setSubmitting(false)
                return;
            }
        }

        const trimmedTitle = title.trim();
        const trimmedCategory = category.trim();
        const trimmedPrice = price.trim();
        const trimmedDescription = description.trim();
  

        if(!trimmedTitle || !trimmedCategory ||!trimmedPrice || !trimmedDescription  ){
            alert('All fields are required');
            setSubmitting(false)
            return;
        }

        try {
            const createdAt = new Date().toDateString()
            const docRef = await addDoc(collection(fireStore, 'products'), {
                title,
                category,
                price,
                description,
                imageUrl,
                userId: auth.user.uid,
                userName: auth.user.displayName || 'Anonymous',
                createAt: createdAt,
            });

            const optimisticItem = {
                id: docRef.id,
                title,
                category,
                price,
                description,
                imageUrl,
                userId: auth.user.uid,
                userName: auth.user.displayName || 'Anonymous',
                createAt: createdAt,
            }

            setItems((prev) => [optimisticItem, ...(prev || [])])

            setImage(null);
            const datas = await fetchFromFirestore();
            setItems(datas)
            toggleModalSell();
            
        } catch (error) {
            console.log(error);
            alert('failed to add items to the firestore')
            
        }finally{
            setSubmitting(false)
        }

        

    }



  return (
    <div>
        <Modal  theme={{
             "content": {
                "base": "relative w-full p-4 md:h-auto",
                "inner": "relative flex max-h-[92dvh] max-w-[900px] w-full mx-auto flex-col rounded-3xl bg-white shadow-2xl overflow-hidden"
            },
        }}  onClick={toggleModalSell} show={status}  className="bg-black"  position={'center'}  size="xl" popup= {true}>
            <ModalBody  className="bg-gradient-to-br from-sky-50 via-white to-white p-0 rounded-3xl h-full overflow-auto"   onClick={(event) => event.stopPropagation()}>
                <img 
                onClick={()=>{
                    toggleModalSell();
                    setImage(null);
                }}
                className="w-6 absolute z-20 top-6 right-8 cursor-pointer hover:scale-105 transition"
                src={close} alt="" />
               
                <div className="relative overflow-hidden rounded-2xl">
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.12),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.12),transparent_40%)]" />
                  <div className="p-6 sm:p-8 space-y-5 relative z-10 h-full overflow-auto">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Create listing</p>
                        <p  className="font-extrabold text-2xl text-slate-900 mt-1">Sell an item</p>
                        <p className="text-sm text-slate-600 mt-1">Add a great title, fair price, and a clear photo to stand out.</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-sky-700 font-semibold bg-white/70 border border-sky-100 px-3 py-1.5 rounded-full shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live preview
                      </div>
                    </div>

                    <form  onSubmit={handleSubmit} className="space-y-3">
                       <Input setInput={setTitle} placeholder ='Title' />
                       <Input setInput={setCategory} placeholder='Category'/>
                       <Input setInput={setPrice} placeholder='Price'/>
                       <Input setInput={setDescription} placeholder='Description'/>

                       <div  className="pt-2 w-full relative">
                       {image ? (
                        <div className="relative h-64 sm:h-72 w-full flex justify-center border border-sky-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                            <img  className="object-contain" src={URL.createObjectURL(image)}   alt="" />
                            <button
                              type="button"
                              onClick={() => setImage(null)}
                              className="absolute top-3 right-3 text-xs px-2 py-1 rounded-full bg-white/80 border border-slate-200 shadow-sm hover:bg-white"
                            >
                              Replace
                            </button>
                        </div>
                       ) : (
                        <label  className="relative h-64 sm:h-72 w-full border-2 border-dashed border-sky-200 rounded-2xl flex flex-col items-center justify-center bg-white hover:border-sky-400 hover:bg-sky-50 transition cursor-pointer shadow-sm">
                            <input
                            onChange={handleImageUpload}
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-30"
                            required
                            />

                            <div  className="flex flex-col items-center gap-2 pointer-events-none">
                                <img  className="w-12" src={fileUpload} alt="" />
                                <p  className="text-center text-sm font-semibold text-slate-800">Drop or click to upload</p>
                                <p  className="text-center text-xs text-slate-500">SVG, PNG, JPG — under 8MB</p>
                            </div>
                        </label>
                       )} 

                       </div>
                       

                       {
                        submitting? (
                            <div  className="w-full flex h-14 justify-center pt-4 pb-2">
                                <img className="w-28 object-cover" src={loading} alt="" />

                            </div>
                        ) : (

                            <div  className="w-full pt-2">
                                <button  className="w-full p-3 rounded-xl text-white font-semibold shadow-lg shadow-sky-200/60 hover:-translate-y-[1px] active:translate-y-0 transition"
                                style={{ background: 'linear-gradient(135deg,#0f172a,#0ea5e9)' }}
                                >Publish listing</button>
                            </div>
                        )
                       }
                     
                    </form>
                  </div>
                </div>
            </ModalBody>

        </Modal  >

      
    </div>
  )
}

export default Sell
