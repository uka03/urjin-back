import { IsDate, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class CreateOrderDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsDate()
  deadline?: Date;

  @IsString()
  receiver: string;
}

export class OrderItemDto {
  @IsString()
  orderId: string;

  @IsString()
  productId: string;

  @IsInt()
  quantity: number;

  @IsInt()
  @IsOptional()
  height?: number;

  @IsInt()
  @IsOptional()
  width?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
