
'use client';

import { useTransition } from 'react';  
import { updateEventStatusAction } from '@/app/actions/schedule-events';  
import { toast } from 'sonner';  
import type { CalendarEventDTO } from '@/types/calendar';  
import type { CalendarEventStatus } from '@/types/calendar';
 
type EventStatus = CalendarEventStatus;

interface EventStatusButtonsProps {  
  eventId: string;  
  currentStatus: EventStatus;  
  onStatusUpdated: (updatedEvent: CalendarEventDTO) => void;  
}

export function EventStatusButtons({ eventId, currentStatus, onStatusUpdated }: EventStatusButtonsProps) {  
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = async (newStatus: CalendarEventStatus) => {
    startTransition(async () => {  
      const result = await updateEventStatusAction(eventId, newStatus);  
      if (result.success && result.event) {  
        toast.success(`Event status updated to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`);  
        onStatusUpdated(result.event);  
      } else {  
        toast.error(`Failed to update status: ${result.error || 'Unknown error'}`);  
      }  
    });  
  };

  const getButtonProps = (targetStatus: CalendarEventStatus) => {  
    let disabled = isPending;  
    let className = 'btn';

 
    const isCurrent = currentStatus === targetStatus;  
    if (isCurrent) {  
      disabled = true;  
      className = `${className} btn-primary`;  
    } else {  
      className = `${className} btn-primary`;  
    }

   
    if (currentStatus === 'completed' || currentStatus === 'cancelled') {  
        disabled = true;  
       
        if (!isCurrent) className = `${className} opacity-50 cursor-not-allowed`;  
        return { className, disabled };  
    }

    switch (targetStatus) {  
      case 'started':  
        if (currentStatus !== 'pending') {  
          disabled = true;  
          if (!isCurrent) className = `${className} opacity-50 cursor-not-allowed`;  
        }  
        break;  
      case 'completed':   
        if (currentStatus !== 'started') {  
          disabled = true;  
          if (!isCurrent) className = `${className} opacity-50 cursor-not-allowed`;  
        }  
        break;  
      case 'cancelled':   
        if (!isCurrent) className = `${className} btn-destructive`;  
        break;  
      case 'pending':  
        disabled = true;  
        if (!isCurrent) className = `${className} opacity-50 cursor-not-allowed`;  
        break;  
    }

    return { className, disabled };  
  };

  return (  
    <div className="flex flex-wrap gap-2">  
      {/* Button to move to 'started' */}  
      <button  
        {...getButtonProps('started')}  
        onClick={() => handleStatusChange('started')}  
      >  
        {isPending && !getButtonProps('started').disabled && currentStatus !== 'started' ? 'Starting...' : 'Mark as Started'}  
      </button>

      {/* Button to move to 'completed' */}  
      <button  
        {...getButtonProps('completed')}  
        onClick={() => handleStatusChange('completed')}  
      >  
        {isPending && !getButtonProps('completed').disabled && currentStatus !== 'completed' ? 'Completing...' : 'Mark as Completed'}  
      </button>

      {/* Button to move to 'cancelled' */}  
      <button  
        {...getButtonProps('cancelled')}  
        onClick={() => handleStatusChange('cancelled')}  
      >  
        {isPending && !getButtonProps('cancelled').disabled && currentStatus !== 'cancelled' ? 'Cancelling...' : 'Mark as Cancelled'}  
      </button>  
    </div>  
  );  
} 