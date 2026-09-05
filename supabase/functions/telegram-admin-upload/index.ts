import { adminClient, corsHeaders, isTelegramAdmin, json, validateInitData, audit } from "../_shared/telegram.ts";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  try{
    const form=await req.formData(), initData=String(form.get("initData")||"");
    const {user}=await validateInitData(initData); if(!await isTelegramAdmin(user.id))return json({ok:false,error:"Không có quyền Admin Telegram."},403);
    const file=form.get("file"); if(!(file instanceof File))throw new Error("Chưa chọn ảnh.");
    if(file.size>6*1024*1024)throw new Error("Ảnh tối đa 6MB.");
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type))throw new Error("Chỉ hỗ trợ JPG, PNG, WEBP, GIF.");
    const ext=(file.name.split(".").pop()||"img").replace(/[^a-zA-Z0-9]/g,"").slice(0,8)||"img";
    const path=`telegram/${user.id}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
    const sb=adminClient(); const {error}=await sb.storage.from("store-hero").upload(path,file,{contentType:file.type,upsert:false}); if(error)throw error;
    const {data}=sb.storage.from("store-hero").getPublicUrl(path); await audit(user.id,"upload_hero_image",{path,size:file.size});
    return json({ok:true,url:data.publicUrl,path});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},400)}
});
