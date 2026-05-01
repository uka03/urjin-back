import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/exceptions/app.exception';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async findAll(query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
            {
              description: {
                contains: query.q,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }, // schema-д createdAt байх ёстой
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new AppException(
        'Product not found',
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
      );
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }
}
