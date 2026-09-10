const SPECIES_LIST = ["alõtša","arukask","ebaküpress, mägi","ebatsuuga","elupuu","haab","hall lepp","hiibapuu","hobukastan","humalapuu","jalakas","jugapuu","kadakas","kask","kikkapuu","kirsipuu/murel","kreek","kuldvihm","kuusk","künnapuu","leeder","lehis","lepp, must","lepp, valge","läätspuu","mänd","mänd, mägi","nulg","paju","pappel","pappel (must-, hiina-)","pihlakas","pirnipuu","ploomipuu","pooppuu","põõsas","pähklipuu","pärn","pöök","remmelgas","robiinia","rododendron","saar","saarvaher","sanglepp","sarapuu","seedermänd","sirel","tamm","toomingas","toompihlakas","türnpuu","vaher","viirpuu","õunapuu","äädikapuu"];
const REASON_LIST = ["Aasia sikk","Ehitusealune raie","Haige puu","Hiina sikk","Hoolduslõikus","Hooldusraie","Hoone või tehnorajatise kahjustamine","Inimtekkeline vigastus","Jalakasurm","Kahjustatud puu raie","Kasvuruum puudub või on sobimatu","Kujundusraie","Lõhenemine","Muu","Nakatunud puu","Ohtlik puu või ohtlik oks","Osaliselt kuivanud","Puu on viltu","Saare-salehundlane","Saaresurm","Sanitaarraie","Tamme-äkksurm","Täielikult kuivanud"];
const DISTRICTS = ["Haabersti","Kesklinn","Kristiine","Lasnamäe","Mustamäe","Nõmme","Pirita","Põhja-Tallinn"];
// Arhiivi otsustel on linnaosa nimi vahel käändevormis (nt "Kesklinna linnaosa" -> "Kesklinna")
// või osa pikemast aadressitekstist ("Harju maakond, Tallinn, Kesklinna") — taandame need
// samadeks väärtusteks, mida linnaosa-filter kasutab, muidu ei leia filter neid üles.
function normalizeDistrict(d){
  if(!d) return null;
  if(DISTRICTS.includes(d)) return d;
  for(const dd of DISTRICTS){ if(d.indexOf(dd)===0 || d.indexOf(dd)!==-1) return dd; }
  return null;
}
const DISTRICT_CENTERS = {
  "Kesklinn":[59.4370,24.7454], "Haabersti":[59.4231,24.6335], "Kristiine":[59.4212,24.7011],
  "Lasnamäe":[59.4372,24.8244], "Mustamäe":[59.4056,24.6796], "Nõmme":[59.3706,24.6636],
  "Pirita":[59.4650,24.8347], "Põhja-Tallinn":[59.4519,24.7106]
};
