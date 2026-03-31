
'use client';

import { Fragment, useState, useTransition } from 'react';  
import { Dialog, Transition } from '@headlessui/react';  
import { toast } from 'sonner';  
import { createEventAction, CreateEventFormInput } from '@/app/actions/schedule-events';  
import { CalendarEventDTO, CalendarProviderOption } from '@/types/calendar';

interface CreateEventModalProps {  
  isOpen: boolean;  
  onClose: () => void;  
  onEventCreated: (event: CalendarEventDTO) => void;  
  providers: CalendarProviderOption[];    
  initialStart?: string;   
  initialEnd?: string;     
}

export function CreateEventModal({  
  isOpen,  
  onClose,  
  onEventCreated,  
  providers,  
  initialStart,  
  initialEnd,  
}: CreateEventModalProps) {  
  const [isPending, startTransition] = useTransition();  
  const [formData, setFormData] = useState<CreateEventFormInput>({  
    title: '',  
    providerId: providers[0]?.id || '',
    startsAt: initialStart || new Date().toISOString().slice(0, 16),  
    endsAt: initialEnd || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),  
    location: '',  
    caseType: '',  
    caseIdentifier: '',  
    patientDisplayName: '',  
    notes: '',  
    colorToken: '',   
    billingClaimId: '',  
  });

    
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {  
    const { name, value } = e.target;  
    setFormData((prev) => ({ ...prev, [name]: value }));  
  };

   
  const handleSubmit = async (e: React.FormEvent) => {  
    e.preventDefault();  
      
    if (!formData.title || !formData.providerId || !formData.startsAt || !formData.endsAt) {  
      toast.error('Title, Provider, Start Time, and End Time are required.');  
      return;  
    }

      
    startTransition(async () => {  
      const result = await createEventAction(formData);  
      if (result.success && result.event) {  
        toast.success('Event created successfully!');  
        onEventCreated(result.event);   
        onClose();   
      } else {  
        toast.error(`Failed to create event: ${result.error || 'Unknown error'}`);  
      }  
    });  
  };

  return (  
    <Transition appear show={isOpen} as={Fragment}>  
      <Dialog as="div" className="relative z-10" onClose={onClose}>  
        {}  
        <Transition.Child  
          as={Fragment}  
          enter="ease-out duration-300"  
          enterFrom="opacity-0"  
          enterTo="opacity-100"  
          leave="ease-in duration-200"  
          leaveFrom="opacity-100"  
          leaveTo="opacity-0"  
        >  
          <div className="fixed inset-0 bg-black bg-opacity-25" />  
        </Transition.Child>

        {}  
        <div className="fixed inset-0 overflow-y-auto">  
          <div className="flex min-h-full items-center justify-center p-4 text-center">  
            <Transition.Child  
              as={Fragment}  
              enter="ease-out duration-300"  
              enterFrom="opacity-0 scale-95"  
              enterTo="opacity-100 scale-100"  
              leave="ease-in duration-200"  
              leaveFrom="opacity-100 scale-100"  
              leaveTo="opacity-0 scale-95"  
            >  
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">  
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">  
                  Create New Event  
                </Dialog.Title>  
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">  
                  {}  
                  <div>  
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700">  
                      Title <span className="text-red-500">*</span>  
                    </label>  
                    <input  
                      type="text"  
                      name="title"  
                      id="title"  
                      required  
                      value={formData.title}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="providerId" className="block text-sm font-medium text-gray-700">  
                      Provider <span className="text-red-500">*</span>  
                    </label>  
                    <select  
                      name="providerId"  
                      id="providerId"  
                      required  
                      value={formData.providerId}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    >  
                      {providers.length === 0 && <option value="">No providers available</option>}  
                      {providers.map((provider) => (  
                        <option key={provider.id} value={provider.id}>  
                          {provider.label}  
                        </option>  
                      ))}  
                    </select>  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="startsAt" className="block text-sm font-medium text-gray-700">  
                      Starts At <span className="text-red-500">*</span>  
                    </label>  
                    <input  
                      type="datetime-local"  
                      name="startsAt"  
                      id="startsAt"  
                      required  
                      value={formData.startsAt}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="endsAt" className="block text-sm font-medium text-gray-700">  
                      Ends At <span className="text-red-500">*</span>  
                    </label>  
                    <input  
                      type="datetime-local"  
                      name="endsAt"  
                      id="endsAt"  
                      required  
                      value={formData.endsAt}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">  
                      Location  
                    </label>  
                    <input  
                      type="text"  
                      name="location"  
                      id="location"  
                      value={formData.location || ''}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="caseType" className="block text-sm font-medium text-gray-700">  
                      Case Type  
                    </label>  
                    <input  
                      type="text"  
                      name="caseType"  
                      id="caseType"  
                      value={formData.caseType || ''}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="patientDisplayName" className="block text-sm font-medium text-gray-700">  
                      Patient Display Name  
                    </label>  
                    <input  
                      type="text"  
                      name="patientDisplayName"  
                      id="patientDisplayName"  
                      value={formData.patientDisplayName || ''}  
                      onChange={handleChange}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div>  
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">  
                      Notes  
                    </label>  
                    <textarea  
                      name="notes"  
                      id="notes"  
                      value={formData.notes || ''}  
                      onChange={handleChange}  
                      rows={3}  
                      className="field mt-1 block w-full"  
                    />  
                  </div>

                  {}  
                  <div className="mt-4 flex justify-end gap-2">  
                    <button  
                      type="button"  
                      className="btn btn-secondary"  
                      onClick={onClose}  
                      disabled={isPending}  
                    >  
                      Cancel  
                    </button>  
                    <button  
                      type="submit"  
                      className="btn btn-primary"  
                      disabled={isPending}  
                    >  
                      {isPending ? 'Creating...' : 'Create Event'}  
                    </button>  
                  </div>  
                </form>  
              </Dialog.Panel>  
            </Transition.Child>  
          </div>  
        </div>  
      </Dialog>  
    </Transition>  
  );  
}  