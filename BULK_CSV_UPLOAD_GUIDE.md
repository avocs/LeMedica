# Bulk CSV Upload Guide for Medical Tourism Packages

## Overview
This guide provides comprehensive instructions for uploading medical tourism packages via CSV file. The system supports intelligent matching of hospital names, treatment names, and doctor names to existing database records.

## CSV File Format

### Required Headers
Use this exact header order:

```csv
title,description,details,hospital_name,treatment_name,Sub Treatments,price,original_price,currency,duration,treatment_category,anaesthesia,commission,featured,status,doctor_name,is_le_package,includes,image_file_id,hospital_location,category,hospital_country,translation_title,translation_description,translation_details,translation
```

### Header Descriptions

| Header | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| `title` | String | ✅ | Package title/name | "Breast Augmentation Package" |
| `description` | String | ❌ | Short description | "Comprehensive breast enhancement surgery" |
| `details` | String | ❌ | Detailed description | "Includes consultation, surgery, and follow-up" |
| `hospital_name` | String | ✅ | Hospital name (must match database) | "Bumrungrad Intl" |
| `treatment_name` | String | ✅ | Treatment name (must match database) | "Breast Augmentation" |
| `Sub Treatments` | String (CSV list) | ❌ | Comma-separated additional treatment names to be linked to this package | "CT Scan, MRI Scan, Blood Test" |
| `price` | Number | ✅ | Current price | 4000 |
| `original_price` | Number | ❌ | Original price (for discounts) | 5000 |
| `currency` | String | ✅ | Currency code | "USD", "THB", "EUR" |
| `duration` | String | ❌ | Procedure duration | "2-3 hours", "1 Night", "3-5 days" |
| `treatment_category` | String | ❌ | Treatment category | "Cosmetic", "Surgery", "Diagnostics" |
| `anaesthesia` | String | ❌ | Anesthesia type | "GA", "LA", "Sedation" |
| `commission` | Number | ❌ | Commission percentage | 15 |
| `featured` | Boolean | ❌ | Featured package | "TRUE", "FALSE" |
| `status` | String | ❌ | Package status | "active", "inactive" |
| `doctor_name` | String | ❌ | Doctor name (optional) | "Dr. Smith" |
| `is_le_package` | Boolean | ❌ | LE package flag | "TRUE", "FALSE" |
| `includes` | String | ❌ | Comma-separated inclusions | "Consultation,Surgery,Follow-up" |
| `image_file_id` | UUID | ❌ | File ID of an already uploaded image (leave blank if none) | "8b4d5e0b-4c4c-4e1a-9c6b-5b8c2a9f1234" |
| `hospital_location` | String | ❌ | Hospital location | "Bangkok, Thailand" |
| `category` | String | ❌ | Package category | "Plastic Surgery" |
| `hospital_country` | String | ❌ | Hospital country | "Thailand" |
| `translation_title` | String | ❌ | Translated title (single language string) | "แพ็กเกจเสริมหน้าอก" |
| `translation_description` | String | ❌ | Translated short description | "ศัลยกรรมเสริมหน้าอกครบวงจร" |
| `translation_details` | String | ❌ | Translated long details | "รวมปรึกษา ผ่าตัด และติดตามผล" |
| `translation` | String | ❌ | Extra translation notes/text | "TH" |

## Available Hospital Names

Use these exact hospital names in your CSV file:

### Thailand
- **Bumrungrad Intl** - International hospital with comprehensive medical services
- **Mery Plastic Surgery** - Leading plastic surgery clinic specializing in facial procedures
- **Pruksa Clinic** - Advanced dermatology and aesthetic medicine center
- **SLC hospital** - Specialized plastic surgery hospital with advanced facilities
- **Panacee Medical Center** - Regenerative medicine and wellness center
- **The Square Clinic** - Specialized dental and implant center
- **Vethjani Hospital** - Comprehensive medical center specializing in general medicine
- **Phuket Plastic Surgery Institute** - Premier plastic surgery and aesthetic medicine center
- **Wansiri Hospital** - Community-focused hospital providing comprehensive medical services

### Malaysia
- **Prince Court** - Premium medical center specializing in oncology and neurology
- **Raffles Medical** - Multi-specialty medical group with comprehensive healthcare services
- **Sunway Medical Center** - Comprehensive medical center with general and specialized services
- **Thomson Hospital** - Comprehensive medical checkup and women's health services

### Taiwan
- **China Medical University Hospital - 中國醫藥大學附設醫院** - Cancer treatment and comprehensive medical services

## Available Treatment Names

Use these exact treatment names in your CSV file:

### Diagnostics
- **Health Checkup** - Comprehensive medical examination
- **Cancer Screening** - Early detection cancer screening tests
- **MRI Scan** - Magnetic Resonance Imaging for detailed body scans
- **CT Scan** - Computed Tomography for cross-sectional imaging
- **PET-CT Scan** - Positron Emission Tomography combined with CT
- **Blood Test** - Comprehensive blood analysis and screening
- **Cardiac Screening** - Comprehensive heart health assessment

### Surgery
- **Hip & Knee Replacement** - Advanced joint replacement surgery
- **Spinal Surgery** - Advanced spinal procedures and disc surgery
- **Brain Tumor Surgery** - Advanced neurosurgical tumor removal
- **Heart Valve Repair** - Advanced cardiac valve surgery
- **Kidney Transplant** - Advanced kidney transplantation surgery
- **Liver Transplant** - Advanced liver transplantation surgery
- **LASIK Surgery** - Advanced laser vision correction
- **Cataract Surgery** - Advanced cataract removal and lens replacement
- **Glaucoma Surgery** - Advanced glaucoma treatment surgery
- **Gastric Sleeve** - Advanced laparoscopic sleeve gastrectomy
- **Gastric Bypass** - Advanced gastric bypass surgery
- **Endoscopic Sleeve Gastroplasty** - Advanced minimally invasive weight loss procedure
- **Gender-Affirming Surgery** - Comprehensive gender confirmation procedures
- **Pacemaker Implantation** - Advanced cardiac pacemaker surgery
- **Prostate Surgery** - Advanced prostate surgery procedures
- **Vasectomy Reversal** - Advanced vasectomy reversal surgery
- **Hysterectomy** - Advanced hysterectomy surgery
- **Fibroid Removal** - Advanced uterine fibroid removal surgery
- **Corneal Transplant** - Advanced corneal transplantation surgery
- **Deep Brain Stimulation (DBS)** - Advanced deep brain stimulation surgery
- **Epilepsy Surgery** - Advanced epilepsy surgical treatment
- **Spinal Cord Surgery** - Advanced spinal cord surgical procedures

### Cosmetic & Plastic Surgery
- **Facial Plastic Surgery** - Advanced facial cosmetic procedures
- **Breast Augmentation** - Cosmetic breast enhancement surgery
- **Rhinoplasty** - Advanced nose reshaping surgery
- **Liposuction** - Advanced body contouring and fat removal
- **Botox Treatment** - Anti-aging botulinum toxin injections
- **Dermal Fillers** - Advanced facial volume enhancement
- **Hair Transplant** - Advanced hair restoration surgery
- **Laser Resurfacing** - Advanced skin rejuvenation treatment
- **Buccal Fat Removal** - Advanced facial contouring through buccal fat removal
- **Chin Augmentation** - Advanced chin enhancement surgery
- **Teeth Whitening** - Advanced professional teeth whitening treatment
- **Veneer** - Advanced dental veneer procedures

### Treatment
- **Dental Implants** - Advanced dental implant procedures
- **Root Canal** - Advanced endodontic root canal treatment
- **IVF (In Vitro Fertilization)** - Advanced in vitro fertilization treatment
- **IUI (Intrauterine Insemination)** - Intrauterine insemination fertility treatment
- **Egg Freezing** - Advanced egg cryopreservation procedure
- **HRT (Hormone Replacement Therapy)** - Hormone replacement therapy for gender transition

### Oncology
- **Chemotherapy** - Advanced cancer chemotherapy treatment
- **Radiation Therapy** - Advanced radiation cancer treatment
- **Immunotherapy** - Advanced cancer immunotherapy treatment
- **Proton Therapy** - Advanced proton radiation therapy

### Wellness
- **Detox Retreats** - Comprehensive detoxification and wellness programs
- **IV Therapy** - Intravenous vitamin and nutrient therapy
- **Anti-Aging Therapy** - Comprehensive anti-aging and rejuvenation treatments
- **Physiotherapy** - Physical therapy and rehabilitation services

### Traditional Medicine
- **Acupuncture** - Traditional Chinese acupuncture therapy
- **Ayurveda** - Traditional Indian Ayurvedic medicine
- **Thai Massage** - Traditional Thai therapeutic massage

## Currency Codes

Supported currency codes:
- **USD** - US Dollar
- **THB** - Thai Baht
- **EUR** - Euro
- **GBP** - British Pound
- **SGD** - Singapore Dollar
- **MYR** - Malaysian Ringgit
- **KRW** - South Korean Won

## Sample CSV File

```csv
title,description,details,hospital_name,treatment_name,Sub Treatments,price,original_price,currency,duration,treatment_category,anaesthesia,commission,featured,status,doctor_name,is_le_package,includes,image_file_id,hospital_location,category,hospital_country,translation_title,translation_description,translation_details,translation
"Breast Augmentation Package","Comprehensive breast enhancement surgery","Includes consultation, surgery, and follow-up care","Bumrungrad Intl","Breast Augmentation","Blood Test, MRI Scan",4000,5000,USD,"2-3 hours",Cosmetic,GA,15,TRUE,active,"Dr. Smith",FALSE,"Consultation,Surgery,Follow-up","","Bangkok, Thailand","Plastic Surgery","Thailand","แพ็กเกจเสริมหน้าอก","ศัลยกรรมเสริมหน้าอกครบวงจร","รวมปรึกษา ผ่าตัด และติดตามผล","TH"
"Rhinoplasty Package","Advanced nose reshaping surgery","Complete rhinoplasty procedure with recovery","Mery Plastic Surgery","Rhinoplasty","CT Scan",3500,4000,USD,"2-3 hours",Cosmetic,GA,15,FALSE,active,"Dr. Johnson",FALSE,"Consultation,Surgery,Follow-up","8b4d5e0b-4c4c-4e1a-9c6b-5b8c2a9f1234","Bangkok, Thailand","Plastic Surgery","Thailand","","","",""
```

## Upload Process

### 1) Prepare your CSV
- Use the exact header order shown above.
- Hospital and Treatment names must match database values (case-insensitive; hospitals support fuzzy matching).
- Use proper CSV escaping for commas/quotes; multi-line fields are supported if quoted.
- For images, leave `image_file_id` blank unless you already have a file `id` (UUID) from a prior upload.
- Optional: add sub-treatments via the “Sub Treatments” column (comma-separated names).

### 2) Upload via Admin UI (recommended)
- Open the Admin “Upload Packages CSV” dialog.
- Select your CSV file.
- Optional: check “Auto-create missing hospitals/treatments” to create missing refs.
- Optional: check “Delete all existing packages before import” to start clean.
- Click Upload and wait for the completion toast.

### 3) Or upload via API
POST multipart/form-data to:
`/api/admin/bulk-import-packages`
- form-data fields:
  - file: your CSV file
  - confirmAutoCreate: "true" | "false" (optional)
  - clearExisting: "true" | "false" (optional)

Example (bash, using curl):
```bash
curl -X POST "http://localhost:3000/api/admin/bulk-import-packages" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -F "file=@/path/to/packages.csv" \
  -F "confirmAutoCreate=true" \
  -F "clearExisting=false"
```

### 4) Verify Import
- Review the API/UI success message for counts and any warnings.
- If errors indicate missing references, either fix the names or re-run with `confirmAutoCreate=true`.

## Important Notes

### Hospital Name Matching
- Hospital names are matched case-insensitively
- Use the exact names from the "Available Hospital Names" section
- If a hospital name doesn't match, the package will be imported with `hospitalId: null`

### Treatment Name Matching
- Treatment names are matched case-insensitively
- Use the exact names from the "Available Treatment Names" section
- If a treatment name doesn't match, the package will be imported with `treatmentId: null`

### Doctor Name Matching
- Doctor names are optional and matched case-insensitively
- If a doctor name doesn't match or is empty, `doctorId` will be set to `null`

### Price Display
- The system displays prices using the currency you provide in the CSV
- Any cross-currency analytics or conversions should rely on `lib/currency-converter.ts`
- Original prices can be used to show discounts when `original_price > price`

### Data Validation
- The script validates UUIDs and skips invalid entries
- Packages with missing required fields (title, price) are skipped
- The importer provides detailed logging and will block when missing references exist unless `confirmAutoCreate=true`

## Troubleshooting

### Common Issues

1. **"Hospital not found" warnings**
   - Check that hospital names match exactly with the available list
   - Ensure proper CSV escaping for hospital names with special characters

2. **"Treatment not found" warnings**
   - Verify treatment names match exactly with the available list
   - Check for typos or extra spaces in treatment names

3. **"Doctor not found" warnings**
   - These are normal if doctors don't exist in the database
   - Doctor names are optional and can be left empty

4. **CSV parsing errors**
   - Ensure proper CSV escaping for fields containing commas or quotes
   - Check that all required headers are present
   - Verify the CSV file is properly formatted

### Getting Help

If you encounter issues:
1. Check the console output for specific error messages
2. Verify your CSV file format matches the requirements
3. Ensure all hospital and treatment names are from the approved lists
4. Check that required fields are not empty

## Best Practices

1. **Test with a small sample** before uploading large files
2. **Backup existing data** before running the import script
3. **Use consistent naming** for hospitals and treatments
4. **Include both price and original_price** for discount display where appropriate
5. **Provide detailed descriptions** for better user experience
6. **Use proper currency codes** for accurate display and conversion
7. **Include duration information** for better package presentation

---

*Last updated: January 2025*
*For technical support, contact the development team*
