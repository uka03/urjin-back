import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/product.module';
import { OrderModule } from './order/order.module';
import { FilesModule } from './files/files.module';
import { CategoryModule } from './category/category.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    CategoryModule,
    OrderModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
