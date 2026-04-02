// Database Types for Rentify System
export interface Profile {
  id: string;
  role: 'admin' | 'landlord' | 'tenant';
  full_name: string | null;
  contact_number: string | null;
  address: string | null;
  profile_picture: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  landlord_id: string;
  name: string;
  address: string;           // street address / landmark
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  description: string | null;
  image_url: string | null;
  total_units: number;
  amenities: any;
  house_rules: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  
  units?: Unit[];
}

export interface Unit {
  id: string;
  property_id: string;
  room_number: string;
  type: 'single' | 'shared' | 'bedspace';
  capacity: number;
  monthly_rent: number;
  status: 'available' | 'occupied' | 'maintenance';
  created_at: string;
  updated_at: string;
}

export interface TenantApplication {
  id: string;
  tenant_id: string;
  unit_id: string;
  application_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  documents: any;           // JSONB
  created_at: string;
  updated_at: string;
}

export interface Rental {
  id: string;
  tenant_id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  security_deposit: number | null;
  status: 'active' | 'ended' | 'terminated';
  created_at: string;
  updated_at: string;
}

export interface Billing {
  id: string;
  rental_id: string;
  billing_month: string;
  due_date: string;
  rent_amount: number;
  utilities: any;           // JSONB
  other_charges: any;       // JSONB
  total_amount: number;
  status: 'unpaid' | 'partial' | 'paid';
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  billing_id: string | null;
  tenant_id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference_number: string | null;
  status: string;
  created_at: string;
}

// For forms and UI
export interface NewUnitForm {
  room_number: string;
  type: 'single' | 'shared' | 'bedspace';
  capacity: number;
  monthly_rent: number;
}

export interface NewPropertyForm {
  name: string;
  barangay: string;
  municipality: string;
  province: string;
  description?: string;
  image_url?: string;
  amenities?: any;
  house_rules?: string;
  status: 'active' | 'inactive';
}