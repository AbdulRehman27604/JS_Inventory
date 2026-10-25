// Public UI schema only. Business records are loaded from the authenticated API.
export const menus={
  "Start": [
    "Dashboard"
  ],
  "Setup": [
    "Company Setup",
    "Location",
    "Item Group Setup",
    "-",
    "Pipe Size Setup",
    "Strip Size Setup",
    "Thickness Setup",
    "Unit Setup",
    "Currency Setup",
    "-",
    "Supplier Setup",
    "Department Creation",
    "Buyer Setup",
    "-",
    "Item Main Category",
    "Item Sub Category",
    "Item Master Setup",
    "GRN Item Setup"
  ],
  "Transactions": [
    "Finished Goods Production Output",
    "GRN (Goods Received Note)",
    "Cutting Creation",
    "-",
    "DC Creation",
    "FINISHED GOODS RECEIVED",
    "FINISHED GOODS RECEIVED DC"
  ],
  "Reports": [
    "Coil Receiving Report",
    "Strip Stock Report",
    "Coil In Hand Report",
    "Pipe Production Output Report",
    "Cutting Issue Report",
    "DC Creation Report",
    "Total Stock Report",
    "Total Stock Detail Report",
    "Goods Received Report",
    "Coil & Strip Stock",
    "Cutting Job Sheets"
  ],
  "System Admin": [
    "Input Permission Setup",
    "User Creation Setup"
  ],
  "Help": [
    "About this local copy",
    "Captured screens",
    "Export local data",
    "Import local data"
  ]
};

export const definitions={
  "Company Setup": {
    "title": "Thickness Setup",
    "heading": "Company Setup",
    "prefix": "Company",
    "capture": "company",
    "rows": []
  },
  "Location": {
    "title": "FrmLoc",
    "prefix": "Location",
    "fields": [
      "Code",
      "Name",
      "Address"
    ],
    "capture": "location",
    "rows": []
  },
  "Item Group Setup": {
    "prefix": "Item Group",
    "capture": "item-group",
    "rows": []
  },
  "Pipe Size Setup": {
    "prefix": "Pipe Size",
    "fields": [
      "Code",
      "Name",
      "Item Group Code",
      "Item Group"
    ],
    "capture": "pipe-size",
    "note": "Only the first 21 visible pipe-size rows were captured. Additional rows exist on the server.",
    "rows": []
  },
  "Strip Size Setup": {
    "prefix": "Strip Size",
    "fields": [
      "Code",
      "Name",
      "Size",
      "Thickness Code",
      "Thickness",
      "Pipe Size Code",
      "Pipe Size",
      "Pipe Weight",
      "Open Quantity"
    ],
    "capture": "strip-size",
    "note": "Only the first strip-size record was captured. Opening Stock uses local record editing; the original stock workflow was not reproduced.",
    "rows": []
  },
  "Thickness Setup": {
    "heading": "Thickness Setup",
    "prefix": "Thickness",
    "capture": "thickness",
    "rows": []
  },
  "Unit Setup": {
    "title": "",
    "prefix": "Unit",
    "capture": "unit",
    "rows": []
  },
  "Currency Setup": {
    "title": "FrmCurrency",
    "prefix": "Currency",
    "fields": [
      "Code",
      "Caption",
      "Picture"
    ],
    "capture": "currency",
    "rows": []
  },
  "Supplier Setup": {
    "title": "",
    "prefix": "Supplier",
    "fields": [
      "Code",
      "Supplier Type",
      "Name",
      "Address",
      "Address 2",
      "Address 3",
      "Mobile#",
      "Phone#",
      "Fax#",
      "Sales Tax #",
      "Income tax#",
      "e-mail"
    ],
    "capture": "supplier",
    "note": "Names and codes were captured for visible rows; contact fields were captured only for the first record.",
    "rows": []
  },
  "Department Creation": {
    "title": "FrmDept",
    "prefix": "Department",
    "capture": "department",
    "rows": []
  },
  "Buyer Setup": {
    "title": "",
    "prefix": "Buyer",
    "fields": [
      "Code",
      "Name",
      "Address",
      "Address 2",
      "Address 3",
      "Mobile#",
      "Phone#",
      "Fax#",
      "Sales Tax #",
      "Income tax#",
      "e-mail"
    ],
    "capture": "buyer",
    "note": "Only the visible list and the first buyer’s contact fields were captured.",
    "rows": []
  },
  "Item Main Category": {
    "title": "FrmItemMainCategory",
    "prefix": "Main Category",
    "capture": "main-category",
    "fields": [
      "Code",
      "Name",
      "Prefix"
    ],
    "note": "GRN Coil Type and Coil Code both select this category. Prefix is the single-letter Coil ID prefix; when blank, the first letter of Name is used. Existing coil IDs never change.",
    "rows": []
  },
  "Item Sub Category": {
    "title": "",
    "prefix": "Item Sub Category",
    "capture": "sub-category",
    "rows": []
  },
  "Item Master Setup": {
    "title": "",
    "heading": "Item Setup",
    "prefix": "Item",
    "wide": true,
    "fields": [
      "Item Type",
      "Code",
      "Company Code",
      "Company Name",
      "Main Category Code",
      "Main Category",
      "Sub Category Code",
      "Sub Category",
      "Description",
      "Thickness Code",
      "Thickness",
      "Pack Size Code",
      "Pack Size",
      "Pack Quantity",
      "Distributor Price",
      "Trade Price",
      "Retail Price",
      "Imported/Local",
      "Re-Order Level",
      "Re-Order Level Qty",
      "Supplier Min Qty",
      "Sort Order",
      "Unit Code",
      "Total Open Qty",
      "Warehouse Opening",
      "Quantity in Hand"
    ],
    "capture": "item-master",
    "note": "Only the first Item Master record was captured. No full item database was downloaded.",
    "rows": []
  },
  "Finished Goods Production Output": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Supplier Code",
      "Supplier",
      "Broker Code",
      "Broker Name",
      "Comments",
      "Lot No",
      "Job No",
      "Item Name",
      "Manuf Code",
      "UOM",
      "Batch No",
      "Weight",
      "Hardness",
      "Grade",
      "Coil",
      "Item Code",
      "Width",
      "Utilize",
      "Wastage",
      "Wght MM",
      "T. Pipe",
      "Order No",
      "DC No",
      "DC Date",
      "Bill No",
      "Bill Date"
    ],
    "capture": "production-form",
    "note": "Opening this screen displayed “Databse is Empty” in the original application. No production output records were captured. The form here is a local substitute.",
    "title": "Frmoutput",
    "heading": "Production Output",
    "lineFields": [
      "Pipe Code",
      "Pipe Description",
      "Thick Code",
      "Thick Name",
      "Strip Code",
      "Strip Name",
      "Strip Size",
      "Quantity",
      "Total Width",
      "Weight",
      "Issue",
      "Lot No",
      "A Quantity",
      "With Joint",
      "Damage"
    ],
    "rows": []
  },
  "GRN (Goods Received Note)": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Supplier Code",
      "Supplier",
      "Broker Code",
      "Broker Name",
      "Comments",
      "Order No",
      "DC No",
      "DC Date",
      "Bill No",
      "Bill Date"
    ],
    "capture": "grn",
    "note": "Only the first Goods Received Note and its two visible line items were captured. Other receiving records remain on the server. For coil tracking, select Item Code/Description from Item Master Setup and Coil Type/Code from Item Main Category. Enter Width in mm, Weight in kg, and UOM KG. Coil IDs are assigned on Save, e.g. C-001-00002-2026.",
    "title": "FrmPurchase",
    "heading": "Goods Received Note",
    "lineFields": [
      "Item Code",
      "Item Description",
      "Manuf Code",
      "UOM",
      "Batch No",
      "Weight",
      "Hardness",
      "Grade",
      "Coil Type",
      "Coil Code",
      "Coil ID",
      "Width"
    ],
    "rows": []
  },
  "Cutting Creation": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Supplier Code",
      "Supplier",
      "Broker Code",
      "Broker Name",
      "Comments",
      "Lot No",
      "Trn No",
      "Item Name",
      "Manuf Code",
      "UOM",
      "Batch No",
      "Weight",
      "Hardness",
      "Grade",
      "Coil",
      "Item Code",
      "Width",
      "Utilize",
      "Wastage",
      "Wght MM",
      "T. Pipe",
      "Order No",
      "DC No",
      "DC Date",
      "Bill No",
      "Bill Date",
      "Coil Reference",
      "Processed Weight",
      "Trim Disposition",
      "Cutting Status"
    ],
    "capture": "cutting",
    "note": "Select a received coil. Widths are mm and weights kg. Quantity is the number of parallel strips. Save a draft, then Post cutting to consume stock. Strip weights are estimates based on equal thickness and length. Each Submit line creates a separate cut with its own saved input weight. Suggested mixed widths share one cut weight. Earlier shared-weight jobs keep their original calculation. Historical records do not affect stock until posted.",
    "title": "FrmCuting",
    "heading": "Cutting Job",
    "lineFields": [
      "Pipe Code",
      "Pipe Description",
      "Thick Code",
      "Thick Name",
      "Strip Code",
      "Strip Name",
      "Strip Size",
      "Quantity",
      "Total Width",
      "Weight",
      "Issue",
      "Lot No",
      "Cut No",
      "Cut Weight"
    ],
    "rows": []
  },
  "DC Creation": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Customer Code",
      "Buyer",
      "Truck No",
      "Driver Name",
      "D.O #",
      "Deliver At",
      "Time In",
      "Time Out",
      "Truck Weight"
    ],
    "capture": "delivery",
    "note": "Only the displayed delivery 00022 and its six lines were captured. An ellipsis preserves text truncated in the original grid. Original DC and Gate Pass templates are unavailable.",
    "heading": "DC Creation",
    "lineFields": [
      "Pipe Code",
      "Product Description",
      "Thick Code",
      "Thickness Desc.",
      "Unit Code",
      "Unit",
      "Quantity",
      "Weight",
      "Rate",
      "Amount"
    ],
    "rows": []
  },
  "FINISHED GOODS RECEIVED": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Supplier Code",
      "Supplier",
      "Truck No",
      "Driver Name",
      "Delivery Challan",
      "Truck Weight"
    ],
    "capture": "finished-received",
    "note": "Only the first visible Finished Goods Received record and its line were captured. The product description was truncated in the original grid.",
    "heading": "Finished Goods Received",
    "lineFields": [
      "Pipe Code",
      "Product Description",
      "Thick Code",
      "Thickness Desc.",
      "Unit Code",
      "Unit",
      "Quantity",
      "Weight",
      "Rate",
      "Amount"
    ],
    "rows": []
  },
  "FINISHED GOODS RECEIVED DC": {
    "prefix": "Document",
    "kind": "transaction",
    "fields": [
      "Code",
      "Date",
      "Customer Code",
      "Buyer",
      "Truck No",
      "Driver Name",
      "Delivery Challan",
      "Deliver At",
      "Time In",
      "Time Out",
      "Truck Weight"
    ],
    "capture": "finished-received-dc",
    "note": "Only the first visible Finished Goods Delivery Challan and its line were captured. The original DC and Gate Pass templates are unavailable.",
    "heading": "Finished Goods Delivery Challan",
    "accent": true,
    "lineFields": [
      "Pipe Code",
      "Product Description",
      "Thick Code",
      "Thickness Desc.",
      "Unit Code",
      "Unit",
      "Quantity",
      "Weight",
      "Rate",
      "Amount"
    ],
    "rows": []
  }
};

export const reportSources={
  "Coil Receiving Report": "GRN (Goods Received Note)",
  "Strip Stock Report": "Cutting Creation",
  "Coil In Hand Report": "GRN (Goods Received Note)",
  "Pipe Production Output Report": "Finished Goods Production Output",
  "Cutting Issue Report": "Cutting Creation",
  "DC Creation Report": "DC Creation",
  "Total Stock Report": "Item Master Setup",
  "Total Stock Detail Report": "Item Master Setup",
  "Goods Received Report": "FINISHED GOODS RECEIVED"
};

export const reportOptions={
  "Pipe Production Output Report": {
    "pipe": true
  },
  "Cutting Issue Report": {
    "pipe": true,
    "thickness": true,
    "issue": true
  },
  "DC Creation Report": {
    "pipe": true,
    "thickness": true,
    "buyer": true,
    "summary": true
  },
  "Total Stock Report": {
    "pipe": true,
    "thickness": true,
    "summary": true,
    "noDates": true
  },
  "Total Stock Detail Report": {
    "pipe": true,
    "thickness": true
  },
  "Goods Received Report": {
    "pipe": true,
    "thickness": true,
    "supplier": true,
    "summary": true
  }
};
